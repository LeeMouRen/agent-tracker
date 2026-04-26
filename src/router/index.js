const TmuxNavigator = require('../navigators/tmux');
const GhosttyNavigator = require('../navigators/ghostty');
const ITermNavigator = require('../navigators/iterm');
const ZellijNavigator = require('../navigators/zellij');

class AgentRouter {
  static normalizeTarget(target) {
    if (target && target.routingInfo) {
      return {
        routingInfo: target.routingInfo,
        projectPath: target.projectPath
      };
    }

    return {
      routingInfo: target,
      projectPath: target?.projectPath
    };
  }

  /**
   * 执行路由跳转
   * @param {Object} routingInfo 从 JSON 状态文件中读取的路由指纹
   */
  static async goto(target) {
    const { routingInfo, projectPath } = this.normalizeTarget(target);

    if (!routingInfo) {
      console.error("[Router] 缺少路由指纹信息");
      return false;
    }

    console.log(`[Router] 准备跳转, 目标指纹:`, routingInfo);

    // 第一阶段：外层终端激活 (Outer Terminal Activation)
    let externalTermActivated = false;
    
    if (routingInfo.termProgram === 'ghostty') {
      externalTermActivated = GhosttyNavigator.activate({ ...routingInfo, projectPath });
    } else if (routingInfo.termProgram === 'iTerm.app') {
      externalTermActivated = ITermNavigator.activate(routingInfo.iTermSessionId);
    } else if (routingInfo.termProgram === 'Apple_Terminal') {
      console.warn("[Router] 暂未实现 Apple Terminal 精确跳转，仅尝试激活应用");
      // TODO: 实现 AppleTerminalNavigator
    }

    // 第二阶段：内部复用器激活 (Inner Multiplexer Activation)
    // 需要等待短暂时间，确保操作系统完成了应用置前动画，防止由于窗口还没获得焦点导致的竞态问题
    return new Promise((resolve) => {
      setTimeout(() => {
        let multiplexerActivated = false;

        if (routingInfo.hasTmux) {
          multiplexerActivated = TmuxNavigator.switchClient(routingInfo);
        } else if (routingInfo.hasZellij) {
          multiplexerActivated = ZellijNavigator.switchClient({ ...routingInfo, projectPath });
        }

        console.log("[Router] 路由跳转指令执行完毕");
        resolve(externalTermActivated || multiplexerActivated);
      }, 150); // 150ms 延迟通常足够 macOS 完成窗口前置
    });
  }
}

module.exports = AgentRouter;
