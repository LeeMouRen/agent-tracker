const fs = require('fs');
const path = require('path');
const os = require('os');

// 当前 agent-tracker bin 的绝对路径
const RECORD_BIN_PATH = path.resolve(__dirname, '../bin/record.js');
const CODEX_CONFIG_PATH = path.join(os.homedir(), '.codex', 'config.toml');

function install() {
  console.log(`[Codex Installer] 正在检查配置: ${CODEX_CONFIG_PATH}`);

  if (!fs.existsSync(CODEX_CONFIG_PATH)) {
    console.error(`[Codex Installer] 找不到 ~/.codex/config.toml，请先运行一次 Codex`);
    return false;
  }

  let configText = '';
  try {
    configText = fs.readFileSync(CODEX_CONFIG_PATH, 'utf8');
  } catch (e) {
    console.error(`[Codex Installer] 读取配置失败: ${e.message}`);
    return false;
  }

  // 构建一个不含有任何外壳转义符和嵌套单双引号冲突的安全可执行脚本路径
  // 我们直接调用 Node，并在 Node 里读取环境变量
  const hookCmdArrayStr = `[\n  "node",\n  "${RECORD_BIN_PATH}",\n  "--status",\n  "WAIT"\n]`;

  const notifyLineRegex = /^notify\s*=\s*\[[\s\S]*?\]/m;
  const match = configText.match(notifyLineRegex);

  if (match) {
    let currentVal = match[0];
    
    if (currentVal.includes('agent-tracker/bin/record.js')) {
      console.log(`[Codex Installer] 已是最新配置`);
      return true;
    }

    // 替换整个 notify 数组块
    configText = configText.replace(notifyLineRegex, `notify = ${hookCmdArrayStr}`);
    console.log(`[Codex Installer] 已更新 notify 钩子配置`);
  } else {
    // 追加到文件头部或第一个匹配到的空行
    configText = `notify = ${hookCmdArrayStr}\n` + configText.replace(/^notify\s*=.*$/gm, '');
    console.log(`[Codex Installer] 已新增 notify 钩子配置`);
  }

  // 写回配置
  try {
    fs.writeFileSync(CODEX_CONFIG_PATH, configText);
    console.log(`[Codex Installer] 🎉 注入成功！`);
    return true;
  } catch (e) {
    console.error(`[Codex Installer] 写入配置失败: ${e.message}`);
    return false;
  }
}

install();