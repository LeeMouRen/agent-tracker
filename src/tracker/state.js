const fs = require('fs');
const path = require('path');

// 统一的本地数据存储目录
// 建议放在用户的 home 目录下，隐藏文件夹
const DATA_DIR = path.join(require('os').homedir(), '.agent-tracker');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

class StateManager {
  static toSessionFilePath(sessionId) {
    return path.join(SESSIONS_DIR, `${String(sessionId || '').replace(/[/\\:]/g, '_')}.json`);
  }

  static mergeRoutingInfo(currentState, nextState) {
    const existing = currentState?.routingInfo || {};
    const incoming = nextState?.routingInfo || {};

    if (!Object.keys(existing).length) return incoming;
    if (!Object.keys(incoming).length) return existing;

    const merged = {
      ...existing,
      ...incoming
    };

    const sameGhosttySession = existing.termProgram === 'ghostty'
      && incoming.termProgram === 'ghostty'
      && existing.tty
      && incoming.tty
      && existing.tty === incoming.tty
      && currentState?.projectPath
      && nextState?.projectPath
      && currentState.projectPath === nextState.projectPath;

    if (sameGhosttySession) {
      const stableKeys = [
        'ghosttyWindowIndex',
        'ghosttyWindowName',
        'ghosttyWindowId',
        'ghosttyTabName',
        'ghosttyTabIndex',
        'ghosttyTerminalId',
        'ghosttyTerminalName'
      ];

      for (const key of stableKeys) {
        if (existing[key] !== undefined && existing[key] !== null && existing[key] !== '') {
          merged[key] = existing[key];
        }
      }
    }

    return merged;
  }

  /**
   * 初始化存储目录
   */
  static initDirs() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
  }

  /**
   * 原子化写入文件，防止并发时数据损坏
   */
  static writeStatusAtomic(filePath, data) {
    const tempPath = filePath + '.tmp.' + process.pid;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
      fs.renameSync(tempPath, filePath);
    } catch (e) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
      throw e;
    }
  }

  /**
   * 写入或更新 Session 状态
   * 
   * @param {string} sessionId 唯一的会话 ID
   * @param {Object} data 需要更新的数据
   */
  static updateSession(sessionId, data) {
    this.initDirs();
    
    if (!sessionId) {
      console.error("[StateManager] 缺少 Session ID，无法更新状态");
      return false;
    }

    const sessionFile = this.toSessionFilePath(sessionId);
    let currentState = {};

    // 如果文件已存在，先读取老状态
    if (fs.existsSync(sessionFile)) {
      try {
        const raw = fs.readFileSync(sessionFile, 'utf-8');
        currentState = JSON.parse(raw);
      } catch (e) {
        console.error(`[StateManager] 读取现有 Session 文件失败: ${e.message}`);
      }
    }

    // 增量合并状态，并更新最后修改时间
    const updatedState = {
      ...currentState,
      ...data,
      routingInfo: this.mergeRoutingInfo(currentState, data),
      lastUpdatedAt: Date.now()
    };

    try {
      this.writeStatusAtomic(sessionFile, updatedState);
      return true;
    } catch (e) {
      console.error(`[StateManager] 写入 Session 文件失败: ${e.message}`);
      return false;
    }
  }

  /**
   * 获取所有活跃的 Sessions
   * @returns {Array<Object>}
   */
  static getAllSessions() {
    this.initDirs();
    const sessions = [];

    try {
      const files = fs.readdirSync(SESSIONS_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf-8');
            sessions.push(JSON.parse(raw));
          } catch (e) {
            console.error(`[StateManager] 跳过损坏的 Session 文件 ${file}: ${e.message}`);
          }
        }
      }
    } catch (e) {
      console.error(`[StateManager] 读取 Sessions 目录失败: ${e.message}`);
    }

    // 自动清理过期数据：
    // 如果一个 session 超过 24 小时没有更新，或者明确标记为 DONE 且超过 10 分钟，我们认为它是脏数据并删掉。
    const now = Date.now();
    const VALID_SESSIONS = [];

    for (const session of sessions) {
      const isExpired = (now - session.lastUpdatedAt) > 24 * 60 * 60 * 1000;
      const isDoneAndOld = session.status === 'DONE' && (now - session.lastUpdatedAt) > 10 * 60 * 1000;

      if (isExpired || isDoneAndOld) {
        try {
           fs.unlinkSync(this.toSessionFilePath(session.sessionId));
           console.log(`[StateManager] 自动清理僵尸 Session: ${session.sessionId}`);
        } catch(e) {}
      } else {
        VALID_SESSIONS.push(session);
      }
    }

    return VALID_SESSIONS;
  }
}

module.exports = StateManager;
