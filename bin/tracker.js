#!/usr/bin/env node

const AgentRouter = require('../src/router');

/**
 * 这是 Agent Tracker 的核心命令行入口
 * 用于模拟 Raycast / uTools 传入从 JSON 里读出来的目标指纹进行跳转
 * 
 * 正常情况下，启动器应该读到这样的真实数据：
 * {
 *   "sessionId": "codex-xxxx",
 *   "agentType": "codex",
 *   "status": "BUSY",
 *   "routingInfo": { ... }
 * }
 */

// 我们硬编码一个模拟的 routingInfo 用于测试我们的 Router 和 Navigators 是否健壮
const mockRoutingInfo = {
  sessionId: "test-session-001",
  termProgram: "ghostty",
  ghosttyTabName: "tmux", // 这个将来由 Hook 和 Tmux 倒查自动生成，或者填入 `test-agent`
  hasTmux: true,
  tmuxPane: process.argv[2] || "%0",
  // iTermSessionId: "w0t0p0:xxxx", // 这个将来是给 iTerm 准备的
};

console.log("=== Agent Tracker 路由启动 ===");

AgentRouter.goto(mockRoutingInfo)
  .then((success) => {
    if (success) {
      console.log("=== 跳转成功！ ===");
    } else {
      console.error("=== 跳转失败，请检查终端配置或权限 ===");
    }
  })
  .catch((err) => {
    console.error("=== 路由异常 ===", err);
  });
