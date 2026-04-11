#!/usr/bin/env node

const StateManager = require('../src/tracker/state');
const EnvironmentHook = require('../src/tracker/hook');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  let sessionId = "default-session";
  let status = "BUSY";

  fs.appendFileSync('/tmp/agent-tracker-debug.log', `\n[${new Date().toISOString()}] EXECUTION START\nARGS: ${JSON.stringify(args)}\nENV KEYS: ${Object.keys(process.env).filter(k => k.includes('SESSION') || k.includes('CLAUDE')).join(', ')}\nCLAUDE_SESSION_ID=${process.env.CLAUDE_SESSION_ID}\nCODEX_SESSION_ID=${process.env.CODEX_SESSION_ID}\n`);

  let payloadJsonStr = null;

  // 使用异步遍历器安全地读取 STDIN (防止阻塞，同时能获取管道传来的所有数据)
  if (!process.stdin.isTTY) {
    try {
      let input = '';
      for await (const chunk of process.stdin) {
        input += chunk;
      }
      if (input.trim()) {
        payloadJsonStr = input.trim();
        fs.appendFileSync('/tmp/agent-tracker-debug.log', `STDIN READ SUCCESS. Length: ${payloadJsonStr.length}\n`);
      } else {
        fs.appendFileSync('/tmp/agent-tracker-debug.log', `STDIN EMPTY\n`);
      }
    } catch (e) {
      fs.appendFileSync('/tmp/agent-tracker-debug.log', `STDIN ERROR: ${e.message}\n`);
    }
  } else {
    fs.appendFileSync('/tmp/agent-tracker-debug.log', `STDIN is TTY\n`);
  }

  // 兜底：在所有参数中寻找看起来像 JSON 对象的字符串
  if (!payloadJsonStr) {
    for (let i = 0; i < args.length; i++) {
      if (args[i].trim().startsWith('{')) {
        payloadJsonStr = args[i];
        break;
      }
    }
  }

  // 简单解析命令行参数 (如 --session xxx --status yyy)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--session' && args[i+1]) {
      sessionId = args[i+1];
      i++;
    } else if (args[i] === '--status' && args[i+1]) {
      status = args[i+1];
      i++;
    }
  }

  let agentType = "claude-code";
  let projectPath = process.cwd();
  let sessionTitle = null;

  // 从 JSON 解析数据
  if (payloadJsonStr) {
    try {
      const payloadData = JSON.parse(payloadJsonStr);
      
      // 如果包含 'thread-id'，说明这是 Codex 的数据结构
      if (payloadData['thread-id']) {
         agentType = "codex";
         sessionId = payloadData['thread-id'];
         if (payloadData.cwd) projectPath = payloadData.cwd;
         status = "WAIT"; 

         // 提取 Codex 的对话摘要
         const msgs = payloadData['input-messages'];
         if (msgs && Array.isArray(msgs)) {
           for (let j = msgs.length - 1; j >= 0; j--) {
             const msg = msgs[j];
             if (msg.role === 'user' && msg.content) {
               if (typeof msg.content === 'string') {
                 sessionTitle = msg.content.slice(0, 80).split('\n')[0].trim();
               } else if (Array.isArray(msg.content)) {
                 for (const part of msg.content) {
                   if ((part.type === 'text' || part.type === 'input_text') && part.text) {
                     sessionTitle = part.text.slice(0, 80).split('\n')[0].trim();
                     break;
                   }
                 }
               }
               if (sessionTitle) break;
             }
           }
         }
         if (!sessionTitle && payloadData['last-assistant-message'] && typeof payloadData['last-assistant-message'] === 'string') {
             sessionTitle = payloadData['last-assistant-message'].slice(0, 80).split('\n')[0].trim();
         }
      } 
      // 否则这就是 Claude 的数据结构
      else if (payloadData.hook_event_name || payloadData.tool_name) {
         agentType = "claude-code";
         
         if (payloadData.session_id) sessionId = payloadData.session_id;
         if (payloadData.project_path || payloadData.cwd) projectPath = payloadData.project_path || payloadData.cwd;
         
         // 提取 Claude 的 Prompt 标题
         if (payloadData.prompt) {
            let cleanPrompt = String(payloadData.prompt);
            // 去除内部标签包裹的系统提示，保留纯用户对话
            cleanPrompt = cleanPrompt.replace(/<system[-_]?(?:instruction|reminder)[^>]*>[\s\S]*?<\/system[-_]?(?:instruction|reminder)>/gi, '');
            cleanPrompt = cleanPrompt.replace(/^[\s\n]*<[^>]+>[\s\S]*?<\/[^>]+>[\s\n]*/gi, '');
            cleanPrompt = cleanPrompt.trim();
            if (cleanPrompt) {
              sessionTitle = cleanPrompt.slice(0, 80).split('\n')[0].trim();
            }
         }

         // 如果没有 Prompt，但有 Tool 执行，提取工具描述
         if (!sessionTitle && payloadData.tool_name) {
            let toolDetails = payloadData.tool_name;
            if (payloadData.tool_input && typeof payloadData.tool_input === 'object') {
               if (payloadData.tool_input.command) {
                   toolDetails += ': ' + String(payloadData.tool_input.command).slice(0, 50);
               } else if (payloadData.tool_input.file_path) {
                   toolDetails += ': ' + require('path').basename(String(payloadData.tool_input.file_path));
               } else {
                   toolDetails += ': ...';
               }
            }
            sessionTitle = "Tool -> " + toolDetails;
         }
      }
    } catch (e) {
      console.error(`[Injector] 无法解析传入的 JSON 数据: ${e.message}`);
    }
  }


  function extractTitleFromHistory(agentType, sessionId) {
    let historyPath;
    let idKey, titleKey;
    
    if (agentType === 'claude-code') {
      historyPath = path.join(os.homedir(), '.claude', 'history.jsonl');
      idKey = 'sessionId';
      titleKey = 'display';
    } else if (agentType === 'codex') {
      historyPath = path.join(os.homedir(), '.codex', 'history.jsonl');
      idKey = 'session_id';
      titleKey = 'text';
    } else {
      return null;
    }

    if (!fs.existsSync(historyPath)) return null;

    try {
      const content = fs.readFileSync(historyPath, 'utf8');
      const lines = content.trim().split('\n');
      
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i]) continue;
        try {
          const entry = JSON.parse(lines[i]);
          if (entry[idKey] === sessionId && entry[titleKey]) {
            let text = String(entry[titleKey]).trim();
            text = text.replace(/<system[-_]?(?:instruction|reminder)[^>]*>[\s\S]*?<\/system[-_]?(?:instruction|reminder)>/gi, '');
            text = text.replace(/^[\s\n]*<[^>]+>[\s\S]*?<\/[^>]+>[\s\n]*/gi, '');
            text = text.trim();
            return text.slice(0, 80).split('\n')[0].trim();
          }
        } catch (e) {
          continue;
        }
      }
    } catch (e) {}
    return null;
  }


  // 兜底 Session ID 保护
  if (!sessionId || sessionId === "default-session") {
     sessionId = agentType + "-" + require('path').basename(process.cwd());
  }

  // 尝试从本地历史文件提取 Title 
  if (!sessionTitle) {
    sessionTitle = extractTitleFromHistory(agentType, sessionId);
  }

  // 如果依旧没有标题并且是 Claude，基于当前路径获取最新的一条 history 作为兜底
  if (!sessionTitle && agentType === 'claude-code') {
      try {
          const historyPath = path.join(os.homedir(), '.claude', 'history.jsonl');
          if (fs.existsSync(historyPath)) {
              const content = fs.readFileSync(historyPath, 'utf8');
              const lines = content.trim().split('\n');
              for (let i = lines.length - 1; i >= 0; i--) {
                  if (!lines[i]) continue;
                  try {
                      const entry = JSON.parse(lines[i]);
                      if (entry.project === projectPath && entry.display) {
                          sessionId = entry.sessionId; // 将真正的 sessionId 覆盖假名
                          let text = String(entry.display).trim();
                          text = text.replace(/<system[-_]?(?:instruction|reminder)[^>]*>[\s\S]*?<\/system[-_]?(?:instruction|reminder)>/gi, '');
                          text = text.replace(/^[\s\n]*<[^>]+>[\s\S]*?<\/[^>]+>[\s\n]*/gi, '');
                          text = text.trim();
                          sessionTitle = text.slice(0, 80).split('\n')[0].trim();
                          break;
                      }
                  } catch (e) {}
              }
          }
      } catch (e) {}
  }

  // 1. 自动提取当前执行环境的“路由指纹”
  const routingInfo = EnvironmentHook.extractRoutingInfo();

  // 2. 组装要写入 JSON 的完整业务状态和路由信息
  const sessionData = {
    sessionId,
    agentType,
    status,
    sessionTitle,
    projectPath,
    routingInfo,
    lastUpdatedAt: Date.now()
  };

  // 3. 交给 StateManager 写入 `~/.agent-tracker/sessions/`
  StateManager.updateSession(sessionId, sessionData);
}

main().catch(err => {
  console.error("Tracker Hook Error:", err);
  process.exit(0);
});
