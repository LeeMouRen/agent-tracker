const { execFileSync } = require('child_process');
const fs = require('fs');

class ZellijNavigator {
  static resolveZellijBin() {
    const candidates = [];
    const pathParts = String(process.env.PATH || '').split(':').filter(Boolean);

    for (const dir of pathParts) {
      candidates.push(`${dir}/zellij`);
    }

    candidates.push('/opt/homebrew/bin/zellij', '/usr/local/bin/zellij', '/usr/bin/zellij');

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      } catch (e) {}
    }

    return 'zellij';
  }

  static runZellij(args) {
    return execFileSync(this.resolveZellijBin(), args, {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: [process.env.PATH || '', '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'].filter(Boolean).join(':')
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  }

  static normalizePaneId(paneId) {
    if (!paneId && paneId !== 0) return null;
    const raw = String(paneId).trim();
    if (!raw) return null;
    if (raw.startsWith('terminal_') || raw.startsWith('plugin_')) return raw;
    if (/^\d+$/.test(raw)) return `terminal_${raw}`;
    return raw;
  }

  static paneRecordId(pane) {
    if (!pane) return null;
    const prefix = pane.is_plugin ? 'plugin_' : 'terminal_';
    return `${prefix}${pane.id}`;
  }

  static listPanes(sessionName) {
    if (!sessionName) return [];

    const raw = this.runZellij(['-s', sessionName, 'action', 'list-panes', '-j', '--all', '--tab', '--state']);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  }

  static listClients(sessionName) {
    if (!sessionName) return [];

    const raw = this.runZellij(['-s', sessionName, 'action', 'list-clients']);
    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length <= 1) return [];

    return lines.slice(1).map((line) => {
      const parts = line.split(/\s+/);
      return {
        clientId: parts[0] || null,
        paneId: parts[1] || null,
        runningCommand: parts.slice(2).join(' ') || null
      };
    });
  }

  static resolveTargetPane(routingInfo, panes) {
    const normalizedPaneId = this.normalizePaneId(routingInfo?.zellijPaneId);

    if (normalizedPaneId) {
      const byId = panes.find((pane) => this.paneRecordId(pane) === normalizedPaneId);
      if (byId) return byId;
    }

    if (routingInfo?.projectPath) {
      const byCwd = panes.find((pane) => !pane.is_plugin && pane.pane_cwd === routingInfo.projectPath);
      if (byCwd) return byCwd;
    }

    if (routingInfo?.zellijTabName) {
      const byTab = panes.find((pane) => pane.tab_name === routingInfo.zellijTabName && pane.is_selectable);
      if (byTab) return byTab;
    }

    return panes.find((pane) => !pane.is_plugin && pane.is_selectable) || null;
  }

  static buildSwitchArgs(sessionName, targetPane) {
    const args = ['-s', sessionName, 'action', 'switch-session', sessionName];

    if (targetPane?.tab_position !== undefined && targetPane?.tab_position !== null) {
      args.push('--tab-position', String(targetPane.tab_position));
    }

    const normalizedPaneId = this.normalizePaneId(targetPane?.id);
    const paneRecordId = this.paneRecordId(targetPane);
    if (normalizedPaneId) {
      args.push('--pane-id', paneRecordId || normalizedPaneId);
    }

    return args;
  }

  static verifyFocus(sessionName, targetPane) {
    const normalizedPaneId = this.paneRecordId(targetPane) || this.normalizePaneId(targetPane?.id);
    if (!normalizedPaneId) return true;

    const clients = this.listClients(sessionName);
    if (!clients.length) return true;

    return clients.some((client) => client.paneId === normalizedPaneId);
  }

  static switchClient(routingInfo) {
    const sessionName = routingInfo?.zellijSessionName;
    if (!sessionName) {
      console.warn('[ZellijNavigator] 缺少 Zellij Session 名称');
      return false;
    }

    try {
      const panes = this.listPanes(sessionName);
      const targetPane = this.resolveTargetPane(routingInfo, panes);

      if (!targetPane) {
        console.warn('[ZellijNavigator] 未找到可用的目标 Pane');
        return false;
      }

      const switchArgs = this.buildSwitchArgs(sessionName, targetPane);
      console.log(`[ZellijNavigator] 尝试切换到 Session: ${sessionName}, Pane: ${this.normalizePaneId(targetPane.id)}`);
      this.runZellij(switchArgs);

      const focused = this.verifyFocus(sessionName, targetPane);
      if (!focused) {
        console.warn('[ZellijNavigator] 已发送切换命令，但当前无法确认焦点已经落到目标 Pane');
      }

      console.log('[ZellijNavigator] Zellij 切换成功！');
      return true;
    } catch (e) {
      const stderr = e.stderr ? e.stderr.toString().trim() : '';
      console.error('[ZellijNavigator] Zellij 切换失败:', stderr || e.message);
      return false;
    }
  }
}

module.exports = ZellijNavigator;
