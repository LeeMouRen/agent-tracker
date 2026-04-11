const { execSync } = require('child_process');

class GhosttyNavigator {
  /**
   * 唤醒 Ghostty 到前台，并尝试点击模糊匹配的 Tab
   * @param {string} [ghosttyTabName] 尝试匹配点击的 Tab 名称（如 tmux 跑起来后可能叫 "tmux"）
   */
  static activate(ghosttyTabName = null) {
    console.log(`[GhosttyNavigator] 尝试将 Ghostty 激活到前台...`);
    
    // Ghostty 原生对 Tab 切换的 AppleScript 支持只读
    // 采用 macOS Accessibility API 进行按钮点击模拟兜底
    
    let appleScript = `
      try
        tell application "Ghostty"
          activate
        end tell
        delay 0.1
    `;

    if (ghosttyTabName) {
      console.log(`[GhosttyNavigator] 尝试模糊匹配并切换到 Tab: '${ghosttyTabName}'`);
      appleScript += `
        tell application "System Events"
          tell process "Ghostty"
            -- 获取当前最前面的窗口
            set frontWin to front window
            -- Ghostty 的 Tab 栏通常是 tab group 1
            set targetGroup to tab group 1 of frontWin
            
            -- 遍历所有的 radio button (即 Tabs)
            set tabClicked to false
            repeat with btn in radio buttons of targetGroup
              -- 模糊包含逻辑：即使是 tmux new -s agent，只要包含传入的关键字即可
              if name of btn contains "${ghosttyTabName}" then
                click btn
                set tabClicked to true
                exit repeat
              end if
            end repeat
            
            -- 未来演进: 如果本窗口没找到，可循环其他 window
          end tell
        end tell
      `;
    }

    appleScript += `
        return "success"
      on error errStr
        return "error: " & errStr
      end try
    `;

    try {
      const result = execSync(`osascript -e '${appleScript}'`).toString().trim();
      if (result === 'success') {
        console.log(`[GhosttyNavigator] Ghostty 已被成功置顶！`);
        return true;
      } else {
        console.error(`[GhosttyNavigator] AppleScript 执行异常:`, result);
        return false;
      }
    } catch (e) {
      console.error(`[GhosttyNavigator] 激活 Ghostty 失败 (可能需要系统隐私辅助功能权限):`, e.message);
      return false;
    }
  }
}

module.exports = GhosttyNavigator;
