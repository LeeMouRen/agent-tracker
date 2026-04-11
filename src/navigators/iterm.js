const { execSync } = require('child_process');

class ITermNavigator {
  /**
   * 通过 Session ID 精确激活 iTerm2 窗口和 Tab
   * @param {string} sessionId iTerm2 的 session ID (如 w0t0p0:XXX)
   */
  static activate(sessionId) {
    if (!sessionId) {
      console.warn(`[ITermNavigator] 没有提供 iTerm Session ID`);
      return false;
    }

    console.log(`[ITermNavigator] 尝试通过 AppleScript 激活 iTerm2 Session ID: ${sessionId}`);

    // JavaScript for Automation (JXA) 写法，比普通 AppleScript 更好遍历对象
    const jxaScript = `
function run(argv) {
  var targetSessionId = argv[0];
  try {
    var iterm = Application('iTerm');
    // 先将应用提至最前
    iterm.activate();
    
    var windows = iterm.windows();
    for (var i = 0; i < windows.length; i++) {
      var tabs = windows[i].tabs();
      for (var j = 0; j < tabs.length; j++) {
        var sessions = tabs[j].sessions();
        for (var k = 0; k < sessions.length; k++) {
          // iTerm Session ID 是唯一的。环境变量里的通常带有前缀，如 w0t1p0:UUID
          // 而 iTerm AppleScript 里拿到的 ID 只有 UUID 部分，所以我们采用包含匹配
          var currentId = sessions[k].id();
          var currentUniqueId = sessions[k].uniqueID();
          
          if (
            targetSessionId.indexOf(currentId) !== -1 || 
            targetSessionId.indexOf(currentUniqueId) !== -1 ||
            currentId === targetSessionId ||
            currentUniqueId === targetSessionId
          ) {
            // 找到了！依次触发选中
            tabs[j].select(); 
            windows[i].select();
            return "success";
          }
        }
      }
    }
    return "not_found";
  } catch (e) {
    return "error: " + e.message;
  }
}
`;

    try {
      // 不要在命令行直接嵌入多行字符串，这极易引起 Bash 和 osascript 解析器的错误。
      // 我们用 child_process.spawnSync 直接通过 stdin 把脚本传给 osascript。
      const { spawnSync } = require('child_process');
      const child = spawnSync('osascript', ['-l', 'JavaScript', '-', sessionId], {
        input: jxaScript,
        encoding: 'utf-8'
      });
      
      if (child.error) {
        throw child.error;
      }

      const result = (child.stdout || '').trim();
      
      if (result === 'success') {
        console.log(`[ITermNavigator] iTerm2 已成功置顶且切换到对应 Tab！`);
        return true;
      } else if (result === 'not_found') {
        console.warn(`[ITermNavigator] 未找到匹配的 iTerm2 Session ID: ${sessionId}`);
        return false;
      } else {
        console.error(`[ITermNavigator] JXA 执行异常:`, result);
        return false;
      }
    } catch (e) {
      console.error(`[ITermNavigator] 激活 iTerm2 失败:`, e.message);
      return false;
    }
  }
}

module.exports = ITermNavigator;
