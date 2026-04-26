#!/usr/bin/env node

const inquirer = require('inquirer');
// 注册支持模糊搜索的 UI 插件
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));
const fuzzy = require('fuzzy');

const StateManager = require('../src/tracker/state');
const AgentRouter = require('../src/router');
const path = require('path');

process.on('uncaughtException', err => {
  if (err.code === 'ERR_USE_AFTER_CLOSE') {
    process.exit(0);
  } else {
    console.error(err);
    process.exit(1);
  }
});

async function main() {
  // 获取所有活跃的 Sessions
  const sessions = StateManager.getAllSessions();
  
  if (sessions.length === 0) {
    console.log("🦊 暂无活跃的 Agent Session。");
    return;
  }

  // 格式化展示内容，准备给 fuzzy 搜索
  const choices = sessions.map(s => {
    // 根据状态给点颜色
    let statusIcon = '⚪';
    if (s.status === 'RUNNING' || s.status === 'BUSY') statusIcon = '🟢';
    if (s.status === 'DONE') statusIcon = '🟠';
    
    // 格式化状态文字
    const displayStatus = s.status === 'BUSY' ? 'RUNNING' : s.status;

    const projectName = path.basename(s.projectPath || 'Unknown Project');
    const agent = `[${s.agentType || 'Unknown Agent'}]`.padEnd(13);
    const terminal = s.routingInfo?.hasTmux ? '(Tmux)' : `(${s.routingInfo?.termProgram || 'Native'})`;
    
    // 拼接提取出的 TITLE 或使用暂无详情兜底
    const titleRaw = s.sessionTitle || "暂无详情...";
    // 为了防止屏幕挤爆，把 title 截断到最多 50 个字符
    const titleStr = titleRaw.length > 50 ? titleRaw.slice(0, 47) + '...' : titleRaw.padEnd(50);

    const displayName = `${statusIcon} ${displayStatus.padEnd(7)} | ${agent} | ${projectName.padEnd(15)} | ${titleStr} | ${terminal}`;

    return {
      name: displayName,
      value: s, // 存储完整对象，方便跳转
      short: projectName // 选择后展示的短名字
    };
  });

  // 定义模糊搜索函数
  function searchSessions(answers, input) {
    input = input || '';
    return new Promise((resolve) => {
      setTimeout(() => {
        const fuzzyResult = fuzzy.filter(input, choices, {
          extract: (el) => el.name
        });
        // 将 filter 的结果还原回 inquirer choice 对象格式
        resolve(fuzzyResult.map((el) => el.original));
      }, 50);
    });
  }

  console.clear();
  console.log("=========================================================================================");
  console.log("                           🦊 Agent Tracker (Type to Search)");
  console.log("=========================================================================================\n");

  const answers = await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'selectedSession',
      message: '过滤 & 选择要跳转的会话:',
      source: searchSessions,
      pageSize: 12,
      emptyText: '🤔 没有找到匹配的会话...'
    }
  ]).catch(err => {
    if (err.name === 'ExitPromptError' || err.message.includes('readline')) {
      // Ignored
      process.exit(0);
    }
    throw err;
  });

  if (!answers) return;
  const targetSession = answers.selectedSession;
  
  console.log(`\n🚀 正在跳转到: ${targetSession.sessionId}...`);
  
  // 执行跨应用路由跳转
  const success = await AgentRouter.goto(targetSession);

  if (success) {
    console.log("✅ 跳转已执行");
  } else {
    console.log("❌ 跳转失败，请检查终端配置");
  }
}

main().catch(err => {
  // Ignore specific inquirer close errors
  if (err.code !== 'ERR_USE_AFTER_CLOSE') {
    console.error(err);
  }
});
