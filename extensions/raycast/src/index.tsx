// @ts-nocheck
import { ActionPanel, Action, List, Icon, Color, closeMainWindow, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import fs from "fs";
import path from "path";

const findTrackerRoot = () => {
  const seeds = [process.env.AGENT_TRACKER_ROOT, __dirname, process.cwd()].filter(Boolean) as string[];
  const visited = new Set<string>();

  for (const seed of seeds) {
    let current = path.resolve(seed);
    while (!visited.has(current)) {
      visited.add(current);

      const routerPath = path.join(current, "src", "router", "index.js");
      const statePath = path.join(current, "src", "tracker", "state.js");
      if (fs.existsSync(routerPath) && fs.existsSync(statePath)) {
        return current;
      }

      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  throw new Error("Cannot locate agent-tracker repository root");
};

const TRACKER_ROOT = findTrackerRoot();

// 定义状态的接口
interface RoutingInfo {
  hasTmux: boolean;
  tmuxPane?: string;
  tmuxSessionName?: string;
  tmuxWindowName?: string;
  termProgram: string;
  ghosttyTabName?: string;
  iTermSessionId?: string;
  tty?: string;
  hasZellij: boolean;
}

interface SessionData {
  sessionId: string;
  agentType: string;
  status: string;
  sessionTitle: string | null;
  projectPath: string;
  routingInfo: RoutingInfo;
  lastUpdatedAt: number;
}

export default function Command() {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getAgentRouter = () => {
    return require(path.join(TRACKER_ROOT, "src/router"));
  };

  const getStateManager = () => {
    return require(path.join(TRACKER_ROOT, "src/tracker/state"));
  };

  // 加载数据
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = () => {
    setIsLoading(true);
    try {
      const StateManager = getStateManager();
      const activeSessions = StateManager.getAllSessions() as SessionData[];

      // 按照更新时间排序，最新鲜的在最上面
      activeSessions.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
      setSessions(activeSessions);
    } catch (e) {
      console.error("Load sessions error:", e);
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 根据状态分配图标和颜色
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "RUNNING":
      case "BUSY":
        return { source: Icon.CircleFilled, tintColor: Color.Green };
      case "DONE":
      case "COMPLETED":
        return { source: Icon.CircleFilled, tintColor: Color.Orange };
      case "WAIT":
      case "IDLE":
      default:
        return { source: Icon.Circle, tintColor: Color.SecondaryText };
    }
  };

  const jumpToSession = async (session: SessionData) => {
    try {
      const AgentRouter = getAgentRouter();
      const success = await AgentRouter.goto(session);

      if (!success) {
        throw new Error("Router returned false");
      }

      await closeMainWindow();
    } catch (e: any) {
      console.error("Jump execution error:", e);
      showToast({
        style: Toast.Style.Failure,
        title: "Jump failed",
        message: e.message
      });
    }
  };

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Filter by project, intent or agent..." throttle>
      {sessions.map((session) => {
        const projectName = path.basename(session.projectPath || "Unknown Project");
        const title = session.sessionTitle || "暂无详情...";
        const terminal = session.routingInfo?.hasTmux ? "Tmux" : (session.routingInfo?.termProgram || "Native");
        const displayStatus = session.status === 'BUSY' ? 'RUNNING' : session.status;
        
        // Raycast 的 List.Item 原生支持多附件和多列排版，比 CLI 漂亮多了
        return (
          <List.Item
            key={session.sessionId}
            icon={getStatusIcon(session.status)}
            title={title}
            subtitle={`[${session.agentType}]`}
            accessories={[
              { text: displayStatus },
              { icon: Icon.Folder, text: projectName },
              { icon: Icon.Terminal, text: terminal }
            ]}
            actions={
              <ActionPanel>
                <Action title="Jump to Agent" icon={Icon.Binoculars} onAction={() => jumpToSession(session)} />
                <Action title="Reload Sessions" icon={Icon.ArrowClockwise} onAction={loadSessions} shortcut={{ modifiers: ["cmd"], key: "r" }} />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
