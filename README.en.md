# 🦊 Agent Tracker

[中文](README.md) | [English](README.en.md)

Agent Tracker is a global session tracker and fast launcher designed specifically for terminal-based AI coding assistants like [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) and [Codex](#).

It acts as a **global dispatch center** for macOS. Whether your Agent is running in iTerm2, Ghostty, or wrapped inside Tmux, Agent Tracker can accurately capture its status (RUNNING / WAIT / DONE), extract conversation intent (TITLE), and allow you to instantly jump back to your workspace across terminals using global shortcuts (like CLI, uTools, Raycast).

## ✨ Features

- 🕵️ **Multi-Agent Support**: Seamlessly supports Claude Code and Codex, intelligently identifying project paths.
- 🔮 **Status & Intent Extraction**: Automatically tracks whether the Agent is "waiting for user", "executing commands", or "done", and grabs your latest prompt to use as the session title!
- 🗺 **Environment Fingerprinting**: Automatically detects host terminals (iTerm2, Ghostty, Apple Terminal) and multiplexers (Tmux, Zellij).
- 🚀 **Cross-Terminal Precision Jump**: Teleport directly into the exact Tmux pane or iTerm session from anywhere in macOS with just a few keystrokes.
- 🔍 **Fuzzy Search**: Built-in efficient fuzzy search allows you to instantly locate hundreds of sessions by typing project names or keywords.

## 📦 Installation & Setup

1. Clone this repository and install dependencies:
   ```bash
   git clone https://github.com/your-username/agent-tracker.git ~/.agent-tracker-app
   cd ~/.agent-tracker-app
   npm install
   ```

2. Inject Hooks into your Agents:

   **For Claude Code users:**
   ```bash
   node scripts/install-claude-hook.js
   ```
   *This automatically injects telemetry probes into your `~/.claude/settings.json` lifecycle events.*

   **For Codex users:**
   Add the following array to your `~/.codex/config.toml`:
   ```toml
   notify = [
     "node",
     "/path/to/.agent-tracker-app/bin/record.js",
     "--status",
     "WAIT"
   ]
   ```

## 🎮 Usage

Run the following command in any terminal:
```bash
node ~/.agent-tracker-app/bin/cli.js
```

You will see a color-coded list of active sessions:
```text
? 过滤 & 选择要跳转的会话: (Use arrow keys or type to search)
❯ 🟢 RUNNING | [claude-code] | my-project | "Write a login endpoint" | (Tmux)
  ⚪ WAIT    | [codex]       | some-lib   | "Explain this code"      | (iTerm.app) 
```

Use arrow keys or type to filter, and press Enter to **instantly teleport to the target terminal pane**.

## 💡 Best Practices

- **Highly recommended to use with Tmux**: Terminal emulators (like Ghostty) expose limited APIs for their internal panes, while Tmux provides perfect precision routing. Running your Agent in a Tmux pane offers the ultimate teleportation experience.
- **Integrate with uTools / Raycast**: You can write a simple script plugin to bind a global shortcut (e.g., `Option + A`). Bring up the panel, type a few letters, and achieve seamless system-wide navigation!
