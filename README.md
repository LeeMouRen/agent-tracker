# 🦊 Agent Tracker

[中文](README.md) | [English](README.en.md)

Agent Tracker 是一个专门为终端里的 AI 编程助手（如 [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)、[Codex](#)）设计的全局会话追踪器与快速启动器。

它是 macOS 的**全局调度中心**。无论你的 Agent 是运行在 iTerm2、Ghostty，还是包裹在 Tmux 之中，Agent Tracker 都能精准地抓取其状态（RUNNING / WAIT / DONE）、提取对话意图（TITLE），并允许你通过全局快捷键（如 CLI、uTools、Raycast）瞬间跨终端跳转回工作现场。

## ✨ 核心特性

- 🕵️ **多 Agent 支持**：无缝支持 Claude Code 及 Codex，智能识别工作路径。
- 🔮 **状态与意图提取**：自动记录 Agent 当前是在“等待用户”、“执行命令”还是“处理完成”，甚至能直接抓取你最新发送给 Agent 的对话作为标题！
- 🗺 **环境指纹采集**：自动探测宿主终端（iTerm2、Ghostty、Apple Terminal）和复用器（Tmux、Zellij）并生成环境指纹。
- 🚀 **跨终端精准跳转**：只需两下键盘，即可从 macOS 的任何角落瞬间唤醒目标终端，并精确跳转到对应的 Tmux Pane 或 iTerm Session。
- 🔍 **模糊搜索**：内置高效的 Fuzzy Search，输入工程名或关键词瞬间定位上百个会话。

## 📦 安装与配置

1. 克隆本仓库并安装依赖：
   ```bash
   git clone https://github.com/your-username/agent-tracker.git ~/.agent-tracker-app
   cd ~/.agent-tracker-app
   npm install
   ```

2. 为 Agent 注入 Hook：

   **对于 Claude Code 用户：**
   ```bash
   node scripts/install-claude-hook.js
   ```
   *这会自动修改你的 `~/.claude/settings.json`，在所有生命周期事件中植入数据采集探针。*

   **对于 Codex 用户：**
   将以下配置添加到你的 `~/.codex/config.toml` 中：
   ```toml
   notify = [
     "node",
     "/path/to/.agent-tracker-app/bin/record.js",
     "--status",
     "WAIT"
   ]
   ```

## 🎮 使用方法

在任何终端中运行：
```bash
node ~/.agent-tracker-app/bin/cli.js
```

你将看到一个包含颜色标识的活跃会话列表：
```text
? 过滤 & 选择要跳转的会话: (Use arrow keys or type to search)
❯ 🟢 RUNNING | [claude-code] | my-project | "帮忙写个登录接口"         | (Tmux)
  ⚪ WAIT    | [codex]       | some-lib   | "解释一下这段代码"         | (iTerm.app) 
```

使用方向键或直接输入关键字过滤，按下回车即可**瞬间传送到目标终端的对应窗格中**。

## 💡 最佳实践

- **强烈推荐搭配 Tmux 使用**：终端模拟器（如 Ghostty 等）对内部窗格暴露的 API 有限，而 Tmux 提供了完美的精确调度能力。将 Agent 跑在 Tmux Pane 里能获得极致的瞬移体验。
- **与 uTools / Raycast 结合**：你可以写一个简单的 Script 插件，绑定全局快捷键（如 `Option + A`），呼出面板后敲击几下即可完成全系统的无缝跳转！
