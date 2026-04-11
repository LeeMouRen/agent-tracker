const { execSync } = require('child_process');

class TmuxNavigator {
  /**
   * 切换 Tmux 到指定的 Pane
   * @param {string} paneId Tmux 的 pane_id，例如 "%14"
   */
  static switchClient(paneId) {
    if (!paneId) {
      console.warn("[TmuxNavigator] Tmux 环境被检测到，但缺少 Pane ID 指纹");
      return false;
    }

    try {
      console.log(`[TmuxNavigator] 尝试切换 Tmux Client 到 Pane: ${paneId}`);
      // switch-client 会强制所有连接的客户端（如果需要的话，或者最近的）跳转到目标 session/window
      execSync(`tmux switch-client -t "${paneId}"`, { stdio: 'inherit' });
      console.log(`[TmuxNavigator] Tmux 切换成功！`);
      return true;
    } catch (e) {
      console.error(`[TmuxNavigator] Tmux 切换失败:`, e.message);
      return false;
    }
  }
}

module.exports = TmuxNavigator;
