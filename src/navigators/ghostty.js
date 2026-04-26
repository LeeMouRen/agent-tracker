const { spawnSync } = require('child_process');
const path = require('path');

class GhosttyNavigator {
  static runOsa(language, script, args = []) {
    const child = spawnSync('osascript', ['-l', language, '-', ...args], {
      input: script,
      encoding: 'utf8'
    });

    if (child.error) {
      throw child.error;
    }

    if (child.status !== 0) {
      throw new Error((child.stderr || '').trim() || `${language} 脚本执行失败`);
    }

    return (child.stdout || '').trim();
  }

  static listTerminals() {
    const jxaScript = `
function run() {
  try {
    const ghostty = Application('Ghostty');
    const result = [];

    ghostty.windows().forEach((windowRef, windowIdx) => {
      const windowIndex = windowIdx + 1;
      const windowName = windowRef.name();
      const windowId = windowRef.id();
      windowRef.tabs().forEach((tabRef) => {
        let focusedTerminalId = '';
        try {
          focusedTerminalId = tabRef.focusedTerminal().id() || '';
        } catch (e) {}

        tabRef.terminals().forEach((terminalRef, terminalIdx) => {
          const terminal = terminalRef.properties();

          result.push({
            windowIndex,
            windowName,
            windowId,
            tabName: tabRef.name(),
            tabIndex: tabRef.index(),
            terminalIndex: terminalIdx + 1,
            terminalId: terminal.id || '',
            terminalName: terminal.name || '',
            focusedTerminalId,
            workingDirectory: terminal.workingDirectory || '',
            isFocused: focusedTerminalId && terminal.id === focusedTerminalId,
          });
        });
      });
    });

    return JSON.stringify(result);
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}
`;

    const raw = this.runOsa('JavaScript', jxaScript);
    const parsed = JSON.parse(raw || '[]');
    if (parsed && parsed.error) {
      throw new Error(parsed.error);
    }
    return Array.isArray(parsed) ? parsed : [];
  }

  static captureActiveMetadata() {
    const jxaScript = `
function run() {
  try {
    const ghostty = Application('Ghostty');
    const windows = ghostty.windows();
    if (!windows.length) return JSON.stringify({});

    const selectedWindow = windows[0];
    const selectedTab = selectedWindow.selectedTab();
    const focusedTerminal = selectedTab.focusedTerminal();

    return JSON.stringify({
      ghosttyWindowIndex: 1,
      ghosttyWindowName: selectedWindow.name(),
      ghosttyWindowId: selectedWindow.id(),
      ghosttyTabName: selectedTab.name(),
      ghosttyTabIndex: selectedTab.index(),
      ghosttyTerminalId: focusedTerminal.id(),
      ghosttyTerminalName: focusedTerminal.name() || '',
      ghosttyWorkingDirectory: focusedTerminal.workingDirectory() || ''
    });
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}
`;

    const raw = this.runOsa('JavaScript', jxaScript);
    const parsed = JSON.parse(raw || '{}');
    if (parsed && parsed.error) {
      throw new Error(parsed.error);
    }

    return parsed || {};
  }

  static normalizeText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  static normalizePath(value) {
    return String(value || '').trim().replace(/\/+$|\\+$/g, '');
  }

  static isMeaningfulName(value) {
    if (!value) return false;
    const trimmed = this.normalizeText(value);
    if (!trimmed) return false;
    if (/^\d+$/.test(trimmed)) return false;
    return true;
  }

  static isNoiseCommand(value) {
    const normalized = this.normalizeText(value).toLowerCase();
    if (!normalized) return true;
    if (normalized.includes('/bin/record.js')) return true;

    const executable = path.basename(normalized.split(' ')[0]);
    return ['node', 'bash', 'zsh', 'sh', 'fish', 'login', 'tmux', 'zellij', 'ghostty'].includes(executable);
  }

  static buildNameHints(context = {}) {
    const rawHints = [];

    if (context.ghosttyTerminalName) rawHints.push(context.ghosttyTerminalName);
    if (context.processCommand) rawHints.push(context.processCommand);
    if (Array.isArray(context.processCommandChain)) {
      rawHints.push(...context.processCommandChain);
    }

    const deduped = new Set();
    for (const rawHint of rawHints) {
      const hint = this.normalizeText(rawHint);
      if (!hint || this.isNoiseCommand(hint)) continue;

      deduped.add(hint);

      const executable = path.basename(hint.split(' ')[0]);
      if (this.isMeaningfulName(executable)) {
        deduped.add(executable);
      }
    }

    return [...deduped];
  }

  static pickBestTerminal(context = {}) {
    const terminals = this.listTerminals();
    if (!terminals.length) return null;

    const ghosttyTerminalId = context.ghosttyTerminalId ? String(context.ghosttyTerminalId).trim() : '';
    const ghosttyTerminalName = this.isMeaningfulName(context.ghosttyTerminalName) ? this.normalizeText(context.ghosttyTerminalName) : '';
    const ghosttyTabName = this.isMeaningfulName(context.ghosttyTabName) ? String(context.ghosttyTabName).trim() : '';
    const ghosttyWindowName = this.isMeaningfulName(context.ghosttyWindowName) ? String(context.ghosttyWindowName).trim() : '';
    const ghosttyWindowIndex = Number(context.ghosttyWindowIndex || 0);
    const ghosttyTabIndex = Number(context.ghosttyTabIndex || 0);
    const projectPath = this.normalizePath(context.projectPath);
    const nameHints = this.buildNameHints(context);

    const scored = terminals
      .map((terminal) => {
        let score = 0;
        const terminalName = this.normalizeText(terminal.terminalName);
        const workingDirectory = this.normalizePath(terminal.workingDirectory);
        const exactProjectMatch = Boolean(projectPath && workingDirectory === projectPath);
        const parentProjectMatch = Boolean(projectPath && workingDirectory && projectPath.startsWith(`${workingDirectory}/`));
        const exactTerminalNameMatch = Boolean(ghosttyTerminalName && terminalName === ghosttyTerminalName);
        const fuzzyTerminalNameMatch = Boolean(ghosttyTerminalName && terminalName && (terminalName.includes(ghosttyTerminalName) || ghosttyTerminalName.includes(terminalName)));
        const exactTabNameMatch = Boolean(ghosttyTabName && terminal.tabName === ghosttyTabName);
        const fuzzyTabNameMatch = Boolean(ghosttyTabName && terminal.tabName && terminal.tabName.includes(ghosttyTabName));
        const exactWindowNameMatch = Boolean(ghosttyWindowName && terminal.windowName === ghosttyWindowName);
        const fuzzyWindowNameMatch = Boolean(ghosttyWindowName && terminal.windowName && (terminal.windowName.includes(ghosttyWindowName) || ghosttyWindowName.includes(terminal.windowName)));
        const idMatched = Boolean(ghosttyTerminalId && terminal.terminalId === ghosttyTerminalId);

        const supportCount = [exactProjectMatch, exactTerminalNameMatch, exactTabNameMatch, exactWindowNameMatch].filter(Boolean).length;
        const conflictCount = [
          Boolean(projectPath && workingDirectory && !exactProjectMatch),
          Boolean(ghosttyTerminalName && terminalName && !exactTerminalNameMatch && !fuzzyTerminalNameMatch),
          Boolean(ghosttyTabName && terminal.tabName && !exactTabNameMatch && !fuzzyTabNameMatch),
          Boolean(ghosttyWindowName && terminal.windowName && !exactWindowNameMatch && !fuzzyWindowNameMatch)
        ].filter(Boolean).length;

        if (idMatched) {
          if (supportCount >= 1) score += 900 + supportCount * 120;
          else if (conflictCount >= 2) score -= 700;
          else score += 220;
        }

        if (exactTerminalNameMatch) score += 500;
        else if (fuzzyTerminalNameMatch) score += 180;
        if (ghosttyWindowIndex && terminal.windowIndex === ghosttyWindowIndex) score += 80;
        if (ghosttyTabIndex && terminal.tabIndex === ghosttyTabIndex) score += 100;
        if (exactProjectMatch) score += 1000;
        else if (parentProjectMatch) score += 80;
        if (exactTabNameMatch) score += 120;
        else if (fuzzyTabNameMatch) score += 40;
        if (exactWindowNameMatch) score += 25;
        else if (fuzzyWindowNameMatch) score += 10;
        if (terminal.isFocused) score += exactProjectMatch ? 120 : 5;

        if (projectPath && workingDirectory && !exactProjectMatch && !parentProjectMatch) score -= 180;
        if (ghosttyTerminalName && terminalName && !exactTerminalNameMatch && !fuzzyTerminalNameMatch) score -= 120;
        if (ghosttyTabName && terminal.tabName && !exactTabNameMatch && !fuzzyTabNameMatch) score -= 80;
        if (ghosttyWindowName && terminal.windowName && !exactWindowNameMatch && !fuzzyWindowNameMatch) score -= 40;

        for (const hint of nameHints) {
          if (terminalName === hint) score += 350;
          else if (terminalName && (terminalName.includes(hint) || hint.includes(terminalName))) score += 140;
        }

        return { ...terminal, score };
      })
      .sort((a, b) => b.score - a.score || a.windowIndex - b.windowIndex || a.tabIndex - b.tabIndex || a.terminalIndex - b.terminalIndex);

    return scored[0]?.score > 0 ? scored[0] : null;
  }

  static pickBestTab(context = {}) {
    return this.pickBestTerminal(context);
  }

  static captureMetadata(context = {}) {
    try {
      const bestTerminal = this.pickBestTerminal(context);
      if (bestTerminal) {
        return {
          ghosttyWindowIndex: bestTerminal.windowIndex,
          ghosttyWindowName: bestTerminal.windowName,
          ghosttyWindowId: bestTerminal.windowId,
          ghosttyTabName: bestTerminal.tabName,
          ghosttyTabIndex: bestTerminal.tabIndex,
          ghosttyTerminalId: bestTerminal.terminalId || null,
          ghosttyTerminalName: bestTerminal.terminalName || null
        };
      }

      const active = this.captureActiveMetadata();
      if (!active.ghosttyTerminalId) return {};

      return {
        ghosttyWindowIndex: active.ghosttyWindowIndex,
        ghosttyWindowName: active.ghosttyWindowName,
        ghosttyWindowId: active.ghosttyWindowId || null,
        ghosttyTabName: active.ghosttyTabName,
        ghosttyTabIndex: active.ghosttyTabIndex,
        ghosttyTerminalId: active.ghosttyTerminalId,
        ghosttyTerminalName: active.ghosttyTerminalName || null
      };
    } catch (e) {
      return {};
    }
  }

  static clickTab(windowName, windowId, tabName, tabIndex, windowIndex, terminalId) {
    const jxaScript = `
function resolveLocationByTerminalId(ghostty, targetTerminalId) {
  if (!targetTerminalId) return null;

  const windows = ghostty.windows();
  for (let i = 0; i < windows.length; i++) {
    const tabs = windows[i].tabs();
    for (let j = 0; j < tabs.length; j++) {
      try {
        const terminalIds = tabs[j].terminals().map((terminal) => terminal.id());
        if (terminalIds.includes(targetTerminalId)) {
          return { windowIndex: i + 1, windowId: windows[i].id(), windowName: windows[i].name(), tabIndex: tabs[j].index() };
        }
      } catch (e) {}
    }
  }

  return null;
}

function raiseWindow(targetWindow) {
  try {
    targetWindow.actions.byName('AXRaise').perform();
  } catch (e) {
    try {
      targetWindow.actions()['AXRaise'].perform();
    } catch (err) {}
  }
}

function bestWindowCandidates(windows, targetWindowId, targetWindowName, targetWindowIndex) {
  const scored = [];
  for (let i = 0; i < windows.length; i++) {
    let score = 0;
    const currentWindow = windows[i];
    const currentName = currentWindow.name();

    if (targetWindowIndex > 0 && i + 1 === targetWindowIndex) score += 50;
    if (targetWindowName && currentName && currentName === targetWindowName) score += 120;
    else if (targetWindowName && currentName && (currentName.indexOf(targetWindowName) !== -1 || targetWindowName.indexOf(currentName) !== -1)) score += 40;
    if (targetWindowId && currentName && currentName === targetWindowName) score += 10;

    scored.push({ window: currentWindow, score, index: i + 1 });
  }

  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((item) => item.window);
}

function selectedTabIndexForWindow(ghostty, targetWindowIndex) {
  try {
    if (targetWindowIndex <= 0) return 0;
    const windowRef = ghostty.windows()[targetWindowIndex - 1];
    if (!windowRef) return 0;
    return Number(windowRef.selectedTab().index() || 0);
  } catch (e) {
    return 0;
  }
}

function activateTabByShortcut(se, targetTabIndex) {
  if (!(targetTabIndex > 0 && targetTabIndex <= 9)) return false;
  se.keystroke(String(targetTabIndex), { using: ['command down'] });
  delay(0.08);
  return true;
}

function clickTargetTab(targetWindow, targetTabName, targetTabIndex, preferIndex) {
  const groups = targetWindow.tabGroups();

  for (let i = 0; i < groups.length; i++) {
    const buttons = groups[i].radioButtons();

    if (preferIndex && targetTabIndex > 0 && buttons.length >= targetTabIndex) {
      buttons[targetTabIndex - 1].click();
      return true;
    }

    if (targetTabName) {
      for (let j = 0; j < buttons.length; j++) {
        const buttonName = buttons[j].name();
        if (buttonName && (buttonName === targetTabName || buttonName.indexOf(targetTabName) !== -1 || targetTabName.indexOf(buttonName) !== -1)) {
          buttons[j].click();
          return true;
        }
      }
    }

    if (targetTabIndex > 0 && buttons.length >= targetTabIndex) {
      buttons[targetTabIndex - 1].click();
      return true;
    }
  }

  return false;
}

function run(argv) {
  const targetWindowName = argv[0] || '';
  const targetWindowId = argv[1] || '';
  const targetTabName = argv[2] || '';
  const targetTabIndex = Number(argv[3] || '0');
  const targetWindowIndex = Number(argv[4] || '0');
  const targetTerminalId = argv[5] || '';

  try {
    const ghostty = Application('Ghostty');
    ghostty.activate();
    delay(0.2);

    const se = Application('System Events');
    const proc = se.processes.byName('ghostty');
    proc.frontmost = true;
    const windows = proc.windows();
    const resolved = resolveLocationByTerminalId(ghostty, targetTerminalId);
    const resolvedWindowIndex = resolved ? resolved.windowIndex : targetWindowIndex;
    const resolvedWindowName = resolved ? resolved.windowName : targetWindowName;
    const resolvedWindowId = resolved ? resolved.windowId : targetWindowId;
    const resolvedTabIndex = resolved ? resolved.tabIndex : targetTabIndex;
    const preferIndex = Boolean(resolved || targetTabIndex > 0);

    const candidates = bestWindowCandidates(windows, resolvedWindowId, resolvedWindowName, resolvedWindowIndex);
    for (let i = 0; i < candidates.length; i++) {
      raiseWindow(candidates[i]);
      delay(0.05);
      if (preferIndex && activateTabByShortcut(se, resolvedTabIndex)) {
        if (selectedTabIndexForWindow(ghostty, resolvedWindowIndex) === resolvedTabIndex) {
          return 'success';
        }
      }

      if (clickTargetTab(candidates[i], targetTabName, resolvedTabIndex, preferIndex)) {
        delay(0.05);
        if (!resolvedTabIndex || selectedTabIndexForWindow(ghostty, resolvedWindowIndex) === resolvedTabIndex) {
          return 'success';
        }
      }
    }

    if (resolvedTabIndex > 0 && resolvedTabIndex <= 9) {
      if (activateTabByShortcut(se, resolvedTabIndex) && selectedTabIndexForWindow(ghostty, resolvedWindowIndex) === resolvedTabIndex) {
        return 'success';
      }
    }

    return 'not_found';
  } catch (e) {
    return 'error: ' + e.message;
  }
}
`;

    return this.runOsa('JavaScript', jxaScript, [windowName || '', windowId || '', tabName || '', String(tabIndex || 0), String(windowIndex || 0), String(terminalId || '')]);
  }

  static focusTerminal(terminalId, windowName, windowId, windowIndex) {
    if (!terminalId) return 'not_needed';

    const jxaScript = `
function resolveLocationByTerminalId(ghostty, targetTerminalId) {
  if (!targetTerminalId) return null;

  const windows = ghostty.windows();
  for (let i = 0; i < windows.length; i++) {
    const tabs = windows[i].tabs();
    for (let j = 0; j < tabs.length; j++) {
      try {
        const terminalIds = tabs[j].terminals().map((terminal) => terminal.id());
        if (terminalIds.includes(targetTerminalId)) {
          return { windowIndex: i + 1, windowName: windows[i].name(), tabIndex: tabs[j].index() };
        }
      } catch (e) {}
    }
  }

  return null;
}

function raiseWindow(targetWindow) {
  try {
    targetWindow.actions.byName('AXRaise').perform();
  } catch (e) {
    try {
      targetWindow.actions()['AXRaise'].perform();
    } catch (err) {}
  }
}

function pickAxWindow(windows, targetWindowName, targetWindowIndex) {
  const scored = [];
  for (let i = 0; i < windows.length; i++) {
    let score = 0;
    const name = windows[i].name();
    if (targetWindowIndex > 0 && i + 1 === targetWindowIndex) score += 50;
    if (targetWindowName && name && name === targetWindowName) score += 120;
    else if (targetWindowName && name && (name.indexOf(targetWindowName) !== -1 || targetWindowName.indexOf(name) !== -1)) score += 40;
    scored.push({ window: windows[i], score, index: i + 1 });
  }

  return scored.sort((a, b) => b.score - a.score || a.index - b.index)[0]?.window || null;
}

function run(argv) {
  const targetTerminalId = argv[0] || '';
  const fallbackWindowName = argv[1] || '';
  const fallbackWindowIndex = Number(argv[2] || '0');

  try {
    const ghostty = Application('Ghostty');
    const se = Application('System Events');
    const resolved = resolveLocationByTerminalId(ghostty, targetTerminalId);
    const targetWindowName = resolved ? resolved.windowName : fallbackWindowName;
    const targetWindowIndex = resolved ? resolved.windowIndex : fallbackWindowIndex;
    const axWindows = se.processes.byName('ghostty').windows();
    const axWindow = pickAxWindow(axWindows, targetWindowName, targetWindowIndex);
    if (axWindow) {
      raiseWindow(axWindow);
      delay(0.05);
    }

    const targetWindow = resolved ? ghostty.windows()[resolved.windowIndex - 1] : ghostty.windows()[0];
    if (!targetWindow) {
      return 'not_found';
    }

    const selectedTab = targetWindow.selectedTab();
    const terminals = selectedTab.terminals();
    const terminalIds = terminals.map((terminal) => terminal.id());

    if (!terminalIds.includes(targetTerminalId)) {
      return 'not_found';
    }

    for (let i = 0; i <= terminalIds.length; i++) {
      const currentFocused = selectedTab.focusedTerminal().id();
      if (currentFocused === targetTerminalId) {
        return 'success';
      }
      se.keystroke(']', { using: ['command down'] });
      delay(0.08);
    }

    for (let i = 0; i <= terminalIds.length; i++) {
      const currentFocused = selectedTab.focusedTerminal().id();
      if (currentFocused === targetTerminalId) {
        return 'success';
      }
      se.keystroke('[', { using: ['command down'] });
      delay(0.08);
    }

    return targetWindow.selectedTab().focusedTerminal().id() === targetTerminalId ? 'success' : 'not_found';
  } catch (e) {
    return 'error: ' + e.message;
  }
}
`;

    return this.runOsa('JavaScript', jxaScript, [String(terminalId), String(windowName || ''), String(windowIndex || 0)]);
  }

  static verifyActiveTerminal(terminalId) {
    if (!terminalId) return false;

    try {
      const active = this.captureActiveMetadata();
      return active.ghosttyTerminalId === terminalId;
    } catch (e) {
      return false;
    }
  }

  /**
   * 唤醒 Ghostty 到前台，并尝试点击模糊匹配的 Tab
   * @param {Object|string} target 路由信息或 tab 名称
   */
  static activate(target = {}) {
    const context = typeof target === 'string' ? { ghosttyTabName: target } : (target || {});
    console.log(`[GhosttyNavigator] 尝试将 Ghostty 激活到前台...`);

    try {
      const bestTerminal = this.pickBestTerminal(context);

      if (bestTerminal) {
        console.log(`[GhosttyNavigator] 命中 Terminal: '${bestTerminal.terminalName}' (${bestTerminal.terminalId}) @ Tab '${bestTerminal.tabName}' / Window '${bestTerminal.windowName}'`);
        const targetTerminalId = context.ghosttyTerminalId || bestTerminal.terminalId;
        const result = this.clickTab(bestTerminal.windowName, bestTerminal.windowId, bestTerminal.tabName, bestTerminal.tabIndex, bestTerminal.windowIndex, targetTerminalId);
        if (result === 'success') {
          const terminalResult = this.focusTerminal(targetTerminalId, bestTerminal.windowName, bestTerminal.windowId, bestTerminal.windowIndex);
          if ((terminalResult === 'success' || terminalResult === 'not_needed') && this.verifyActiveTerminal(targetTerminalId)) {
            console.log(`[GhosttyNavigator] Ghostty 已被成功置顶并切换到目标 Tab！`);
            return true;
          }

          if (terminalResult.startsWith('error')) {
            console.warn(`[GhosttyNavigator] Tab 已切换，但 Terminal 聚焦失败: ${terminalResult}`);
          } else {
            console.warn(`[GhosttyNavigator] Tab 已切换，但目标 Terminal 不在当前 Tab 中: ${terminalResult}`);
          }
        }

        if (result !== 'success') {
          console.warn(`[GhosttyNavigator] 未能点击目标 Tab，回退到仅激活应用: ${result}`);
        } else {
          console.warn('[GhosttyNavigator] 已命中目标 Tab，但未能精确聚焦到目标 Terminal，回退到仅激活应用');
        }
      }

      this.runOsa('AppleScript', 'tell application "Ghostty" to activate');
      console.log(`[GhosttyNavigator] Ghostty 已被成功置顶！`);
      return true;
    } catch (e) {
      console.error(`[GhosttyNavigator] 激活 Ghostty 失败 (可能需要系统隐私辅助功能权限):`, e.message);
      return false;
    }
  }
}

module.exports = GhosttyNavigator;
