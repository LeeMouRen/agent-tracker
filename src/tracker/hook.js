const { execSync } = require('child_process');

class EnvironmentHook {
  /**
   * 提取当前执行环境的指纹 (Routing Fingerprint)
   * 
   * 当 Agent 启动或状态变化触发钩子时，此方法抓取环境变量，
   * 确定 Agent 被困在哪个终结里（Tmux/iTerm2/Ghostty 等）
   * @returns {Object} 路由信息对象
   */
  static extractRoutingInfo() {
    const env = process.env;
    const routingInfo = {};

    // Tmux 会覆盖 TERM_PROGRAM 为 'tmux'，我们需要优先处理 tmux 倒查
    if (env.TMUX) {
      routingInfo.hasTmux = true;
      routingInfo.tmuxPane = env.TMUX_PANE || null;

      try {
        // 利用 Tmux 查询外层终端的环境变量
        // 比如从 tmux server 获取最初客户端连接时的环境变量 TERM_PROGRAM 等
        // tmux show-environment -g 或者直接取客户端的 client_termname
        
        // 1. 获取 Session 和 Window 详情
        const tmuxDetails = execSync(`tmux display-message -p -t "${routingInfo.tmuxPane}" "#{client_session}|#{window_name}|#{client_termname}"`).toString().trim();
        const [sessionName, windowName, clientTermname] = tmuxDetails.split('|');
        routingInfo.tmuxSessionName = sessionName;
        routingInfo.tmuxWindowName = windowName;

        // 2. 尝试穿透 Tmux 获取真实的 TERM_PROGRAM
        // 注意：多数情况下我们需要查询 tmux 启动时客户端的环境变量
        try {
          // tmux show-environment 返回类似 TERM_PROGRAM=iTerm.app
          // 我们查询客户端所在会话的环境变量，如果查不到再查全局
          const termProgRaw = execSync(`tmux show-environment -t "${sessionName}" TERM_PROGRAM 2>/dev/null || tmux show-environment -g TERM_PROGRAM 2>/dev/null || echo ""`).toString().trim();
          if (termProgRaw && termProgRaw.includes('=')) {
             routingInfo.termProgram = termProgRaw.split('=')[1];
          } else {
             // 启发式：client_termname 有时会包含 ghostty (如 xterm-ghostty)
             if (clientTermname && clientTermname.includes('ghostty')) {
                 routingInfo.termProgram = 'ghostty';
             } else {
                 routingInfo.termProgram = 'tmux'; // 彻底查不到的兜底
             }
          }
        } catch (e) {
            // fallback
            routingInfo.termProgram = 'tmux';
        }

        // iTerm2 的 session ID 穿透提取
        try {
           const itermSessionRaw = execSync(`tmux show-environment -t "${sessionName}" ITERM_SESSION_ID 2>/dev/null || echo ""`).toString().trim();
           if (itermSessionRaw && itermSessionRaw.includes('=')) {
               routingInfo.iTermSessionId = itermSessionRaw.split('=')[1];
           }
        } catch (e) {}

        // Ghostty Tab 名称推断
        if (routingInfo.termProgram === 'ghostty') {
            routingInfo.ghosttyTabName = sessionName; 
        }
      } catch (e) {
        // Tmux 详情获取失败
        routingInfo.termProgram = 'tmux';
      }

    } else {
      // 没有任何复用器，直接取当前环境
      routingInfo.hasTmux = false;
      routingInfo.termProgram = env.TERM_PROGRAM || null;
      
      if (env.ITERM_SESSION_ID) routingInfo.iTermSessionId = env.ITERM_SESSION_ID;
      if (env.TERM_SESSION_ID && routingInfo.termProgram === 'Apple_Terminal') {
        routingInfo.appleTerminalSessionId = env.TERM_SESSION_ID;
      }
      if (env.VSCODE_PID) routingInfo.vscodePid = env.VSCODE_PID;
    }

    routingInfo.tty = this.getTTY();

    // Zellij 判定
    if (env.ZELLIJ) {
      routingInfo.hasZellij = true;
      routingInfo.zellijSessionName = env.ZELLIJ_SESSION_NAME || null;
    } else {
      routingInfo.hasZellij = false;
    }

    return routingInfo;
  }

  // 辅助方法：获取当前执行进程所属的 TTY 设备路径
  static getTTY() {
    try {
      return execSync('tty').toString().trim();
    } catch (e) {
      return null;
    }
  }
}

module.exports = EnvironmentHook;
