const { execFileSync } = require('child_process');
const fs = require('fs');

class TmuxNavigator {
  static resolveTmuxBin() {
    const candidates = [];
    const pathParts = String(process.env.PATH || '').split(':').filter(Boolean);

    for (const dir of pathParts) {
      candidates.push(`${dir}/tmux`);
    }

    candidates.push('/opt/homebrew/bin/tmux', '/usr/local/bin/tmux', '/usr/bin/tmux');

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      } catch (e) {}
    }

    return 'tmux';
  }

  static runTmux(args) {
    return execFileSync(this.resolveTmuxBin(), args, {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: [process.env.PATH || '', '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'].filter(Boolean).join(':')
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  }

  static resolveTarget(paneId) {
    return this.runTmux(['display-message', '-p', '-t', paneId, '#{session_name}:#{window_index}']);
  }

  static describePane(paneId) {
    const raw = this.runTmux(['display-message', '-p', '-t', paneId, '#{client_tty}|#{client_name}|#{session_name}|#{session_id}|#{window_index}|#{window_id}|#{pane_index}|#{pane_id}']);
    const [clientTty, clientName, sessionName, sessionId, windowIndex, windowId, paneIndex, resolvedPaneId] = raw.split('|');
    return {
      clientTty: clientTty || null,
      clientName: clientName || null,
      sessionName: sessionName || null,
      sessionId: sessionId || null,
      windowIndex: windowIndex || null,
      windowId: windowId || null,
      paneIndex: paneIndex || null,
      paneId: resolvedPaneId || paneId
    };
  }

  static getClientState(clientKey) {
    if (!clientKey) return null;

    const rawClients = this.runTmux(['list-clients', '-F', '#{client_tty}|#{client_name}|#{session_name}|#{session_id}|#{window_index}|#{window_id}|#{pane_id}|#{client_activity}']);
    const clients = rawClients
      .split('\n')
      .map((line) => {
        const [clientTty, clientName, sessionName, sessionId, windowIndex, windowId, paneId, clientActivity] = line.split('|');
        return {
          clientTty,
          clientName,
          sessionName,
          sessionId,
          windowIndex,
          windowId,
          paneId,
          clientActivity: Number(clientActivity || 0)
        };
      });

    return clients.find((client) => client.clientTty === clientKey || client.clientName === clientKey) || null;
  }

  static resolveTargetClient(routingInfo, paneMeta) {
    const hintedClient = routingInfo?.tmuxClientTty || routingInfo?.tmuxClientName;
    if (hintedClient) return hintedClient;
    if (paneMeta?.clientTty) return paneMeta.clientTty;
    if (paneMeta?.clientName) return paneMeta.clientName;
    return this.findTargetClient(routingInfo?.tmuxSessionName || paneMeta?.sessionName);
  }

  static buildWindowTargets(routingInfo, paneMeta) {
    const targets = [];

    if (routingInfo?.tmuxWindowId) targets.push(routingInfo.tmuxWindowId);
    if (paneMeta?.windowId) targets.push(paneMeta.windowId);

    const sessionName = routingInfo?.tmuxSessionName || paneMeta?.sessionName;
    const sessionId = routingInfo?.tmuxSessionId || paneMeta?.sessionId;
    const windowIndex = routingInfo?.tmuxWindowIndex || paneMeta?.windowIndex;

    if (sessionName && windowIndex !== null && windowIndex !== undefined) {
      targets.push(`${sessionName}:${windowIndex}`);
    }

    if (sessionId && windowIndex !== null && windowIndex !== undefined) {
      targets.push(`${sessionId}:${windowIndex}`);
    }

    return [...new Set(targets.filter(Boolean))];
  }

  static verifyClientPane(clientKey, paneId) {
    const clientState = this.getClientState(clientKey);
    return Boolean(clientState && clientState.paneId === paneId);
  }

  static executeTargetedSwitch(clientKey, sessionTarget, windowTargets, paneId) {
    if (!clientKey) return false;

    const sessionCommands = [];
    if (sessionTarget) {
      sessionCommands.push(['switch-client', '-c', clientKey, '-t', sessionTarget]);
    }

    const commands = [
      ...sessionCommands,
      ...windowTargets.map((windowTarget) => ['select-window', '-t', windowTarget]),
      ['select-pane', '-t', paneId],
      ['refresh-client', '-t', clientKey]
    ];

    for (const args of commands) {
      try {
        this.runTmux(args);
      } catch (e) {
        if (args[0] === 'select-window') {
          continue;
        }
        throw e;
      }
    }

    return this.verifyClientPane(clientKey, paneId);
  }

  static findTargetClient(sessionName) {
    if (!sessionName) return null;

    const rawClients = this.runTmux(['list-clients', '-F', '#{client_tty}|#{session_name}|#{client_activity}']);
    const clients = rawClients
      .split('\n')
      .map((line) => {
        const [clientTty, attachedSessionName, clientActivity] = line.split('|');
        return {
          clientTty,
          attachedSessionName,
          clientActivity: Number(clientActivity || 0)
        };
      })
      .filter((client) => client.clientTty && client.attachedSessionName === sessionName)
      .sort((a, b) => b.clientActivity - a.clientActivity);

    return clients[0]?.clientTty || null;
  }

  /**
   * 切换 Tmux 到指定的 Pane
   * @param {Object|string} routingInfo 路由信息对象，或直接传 pane_id
   */
  static switchClient(routingInfo) {
    const paneId = typeof routingInfo === 'string' ? routingInfo : routingInfo?.tmuxPane;
    const hintedSessionName = typeof routingInfo === 'string' ? null : routingInfo?.tmuxSessionName;

    if (!paneId) {
      console.warn("[TmuxNavigator] Tmux 环境被检测到，但缺少 Pane ID 指纹");
      return false;
    }

    try {
      const paneMeta = this.describePane(paneId);
      const target = this.resolveTarget(paneId);
      const sessionName = hintedSessionName || paneMeta.sessionName || target.split(':')[0];
      const sessionTarget = routingInfo?.tmuxSessionId || paneMeta.sessionId || sessionName;
      const clientTty = this.resolveTargetClient(routingInfo, paneMeta);
      const windowTargets = this.buildWindowTargets(routingInfo, paneMeta);

      console.log(`[TmuxNavigator] 尝试切换到 Pane: ${paneId} (${target})`);

      if (clientTty) {
        console.log(`[TmuxNavigator] 命中目标 Client: ${clientTty}`);
        const switched = this.executeTargetedSwitch(clientTty, sessionTarget, windowTargets, paneId);
        if (!switched) {
          console.warn('[TmuxNavigator] 精确切换后仍未命中目标 Pane，执行回退流程');
          this.runTmux(['switch-client', '-c', clientTty, '-t', target]);
          this.runTmux(['select-pane', '-t', paneId]);
          this.runTmux(['refresh-client', '-t', clientTty]);
        }
      } else {
        console.warn('[TmuxNavigator] 未找到附着在目标 Session 上的 Client，回退到默认 switch-client');
        this.runTmux(['switch-client', '-t', target]);
        windowTargets.forEach((windowTarget) => {
          try {
            this.runTmux(['select-window', '-t', windowTarget]);
          } catch (e) {}
        });
        this.runTmux(['select-pane', '-t', paneId]);
      }

      console.log(`[TmuxNavigator] Tmux 切换成功！`);
      return true;
    } catch (e) {
      const stderr = e.stderr ? e.stderr.toString().trim() : '';
      console.error(`[TmuxNavigator] Tmux 切换失败:`, stderr || e.message);
      return false;
    }
  }
}

module.exports = TmuxNavigator;
