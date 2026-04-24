const fs = require('fs');
const path = require('path');
const os = require('os');

// 当前 agent-tracker bin 的绝对路径
const RECORD_BIN_PATH = path.resolve(__dirname, '../bin/record.js');
const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

// 定义 Claude Code 的生命周期事件及其对应的 Tracker Status
// 注意：Claude Code v0.2.x 之后的 Hooks 键名变为大写驼峰形式
const HOOKS_MAP = {
  'SessionStart': 'IDLE',
  'SessionEnd': 'DONE',
  'UserPromptSubmit': 'RUNNING',
  'PostToolUse': 'WAIT',
  'Stop': 'WAIT',
  'PreToolUse': 'RUNNING'
};

function install() {
  console.log(`[Claude Installer] 正在检查配置: ${CLAUDE_SETTINGS_PATH}`);

  if (!fs.existsSync(CLAUDE_SETTINGS_PATH)) {
    console.error(`[Claude Installer] 找不到 ~/.claude/settings.json`);
    return false;
  }

  let settings = {};
  try {
    const raw = fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf8');
    settings = JSON.parse(raw);
  } catch (e) {
    console.error(`[Claude Installer] 读取配置失败: ${e.message}`);
    return false;
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }
  
  // 清理刚才错误注入的无效键
  const invalidKeys = ['session-start', 'session-end', 'prompt-started', 'prompt-completed', 'tool-started', 'tool-completed', 'ProcessTaskComplete'];
  for (const key of invalidKeys) {
      if (settings.hooks[key]) {
          delete settings.hooks[key];
      }
  }

  for (const [event, status] of Object.entries(HOOKS_MAP)) {
    // 构建我们新的 Agent Tracker Command Hook 结构
    // 强制继承当前环境变量以保证能够获取 TMUX 等信息
    const cmdStr = `node "${RECORD_BIN_PATH}" --session "$CLAUDE_SESSION_ID" --status "${status}" --tmux "$TMUX" --tmux-pane "$TMUX_PANE" --term-program "$TERM_PROGRAM" --iterm-session "$ITERM_SESSION_ID" &> /dev/null &`;
    const newHookDef = {
      type: "command",
      command: cmdStr,
      timeout: 5
    };

    if (!settings.hooks[event]) {
      // 没配置过这个事件，直接作为数组初始化
      settings.hooks[event] = [{
          matcher: "",
          hooks: [newHookDef]
      }];
      console.log(`   - 钩子 ${event.padEnd(16)}: 已新增配置`);
    } else if (Array.isArray(settings.hooks[event])) {
      // 已经存在该事件组，找一个没有特定 matcher 的全局 hook group 追加进去
      let globalGroup = settings.hooks[event].find(g => !g.matcher || g.matcher === "");
      if (!globalGroup) {
        globalGroup = { matcher: "", hooks: [] };
        settings.hooks[event].push(globalGroup);
      }
      
      // 检查是否已经包含了 agent-tracker，如果没有则添加
      const alreadyHasTracker = globalGroup.hooks.some(h => h.command && h.command.includes('agent-tracker/bin/record.js'));
      
      if (!alreadyHasTracker) {
          globalGroup.hooks.push(newHookDef);
          console.log(`   - 钩子 ${event.padEnd(16)}: 已追加到现有数组`);
      } else {
          console.log(`   - 钩子 ${event.padEnd(16)}: 已是最新配置`);
      }
    }
  }

  try {
    fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2));
    console.log(`[Claude Installer] 🎉 注入修复成功！请重新启动 Claude Code 测试。`);
    return true;
  } catch (e) {
    console.error(`[Claude Installer] 写入配置失败: ${e.message}`);
    return false;
  }
}

install();