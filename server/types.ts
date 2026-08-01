import type { GithubTasksConfig } from "./configPersistence.js";
import type { AgentProvider } from "./sourceTypes.js";
import type { AgentSessionState } from "./sessionIdentity.js";
import type { SessionHistoryItem } from "./sessionCatalog.js";

// Agent activity states
export type AgentActivity = "idle" | "typing" | "reading" | "waiting" | "permission";

// Tool info for speech bubbles
export interface ActiveTool {
  toolId: string;
  toolName: string;
  status: string;
}

// Agent as tracked by the server
export interface TrackedAgent {
  key: string;
  provider: AgentProvider;
  id: number;
  sessionId: string;
  projectDir: string;
  projectName: string;
  nameSource?: "fallback" | "derived" | "explicit";
  jsonlFile: string;
  fileOffset: number;
  lineBuffer: string;
  activity: AgentActivity;
  activeTools: Map<string, ActiveTool>;
  activeToolNames: Map<string, string>;
  activeSubagentToolIds: Map<string, Set<string>>;
  activeSubagentToolNames: Map<string, Map<string, string>>;
  isWaiting: boolean;
  permissionSent: boolean;
  hadToolsInTurn: boolean;
  lastActivityTime: number;
  // Token usage tracking
  model?: string;
  gitBranch?: string;
  cwd?: string;
  version?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheRead: number;
  totalCacheCreation: number;
  currentContextTokens?: number;
  currentContextLimit?: number;
  currentInputTokens?: number;
  currentOutputTokens?: number;
  currentCacheRead?: number;
  turnCount: number;
  totalDurationMs: number;
  startTime?: string;
  // Deep inspection
  permissionMode?: string;
  toolHistory: Array<{ name: string; timestamp: string; durationMs?: number; toolId?: string }>;
  // Role — from Claude Code's agentSetting field in JSONL
  agentSetting?: string;   // real role from Claude Code (e.g. "Explore", "Code Reviewer")
  agentDescription?: string; // description from meta.json (e.g. "Review code for security issues")
  role?: string;           // resolved = agentSetting or derived from description
  toolCounts?: Record<string, number>;  // tool name -> invocation count
  // Conversation history (text blocks from assistant/user messages)
  conversation: Array<{
    role: 'assistant' | 'user'
    text: string
    timestamp: string
    toolNames?: string[]
  }>;
  // Parent-child relationship for subagent JSONL files
  parentSessionId?: string;  // session ID of the parent agent (from file path)
  parentAgentId?: number;    // resolved numeric ID of the parent agent
  teamName?: string;         // team name from TeamCreate (e.g., "pipeline-debate")
  isTeamLead?: boolean;      // true if this agent is the team lead (no agentName in team)
  sessionState?: AgentSessionState;
  sessionHost?: string;
  processPid?: number;
  processStartTime?: string;
  tmuxTarget?: string;
  tmuxAttached?: boolean;
}

// Messages sent from server to client via WebSocket
// Must match the upstream message format expected by useExtensionMessages
export type ServerMessage =
  | { type: "agentCreated"; id: number; folderName: string; provider?: AgentProvider; parentAgentId?: number; teamName?: string; isTeamLead?: boolean }
  | { type: "agentClosed"; id: number }
  | { type: "existingAgents"; agents: number[]; folderNames: Record<number, string>; providers?: Record<number, string>; sessionStates?: Record<number, { state: AgentSessionState; host: string; pid?: number; processStartTime?: string; tmuxTarget?: string; tmuxAttached?: boolean }>; agentMeta?: Record<number, { palette?: number; hueShift?: number; seatId?: string }>; parentAgentIds?: Record<number, number>; teamNames?: Record<number, string>; isTeamLeads?: Record<number, boolean> }
  | { type: "agentSessionState"; id: number; state: AgentSessionState; host: string; pid?: number; processStartTime?: string; tmuxTarget?: string; tmuxAttached?: boolean; reason?: string }
  | { type: "agentSessionNotice"; id: number; message: string }
  | { type: "sessionList"; sessions: SessionHistoryItem[] }
  | { type: "sessionNotice"; message: string }
  | { type: "agentToolStart"; id: number; toolId: string; status: string }
  | { type: "agentToolDone"; id: number; toolId: string }
  | { type: "agentToolsClear"; id: number }
  | { type: "agentStatus"; id: number; status: string }
  | { type: "agentToolPermission"; id: number }
  | { type: "agentToolPermissionClear"; id: number }
  | { type: "subagentToolStart"; id: number; parentToolId: string; toolId: string; status: string }
  | { type: "subagentToolDone"; id: number; parentToolId: string; toolId: string }
  | { type: "subagentToolPermission"; id: number; parentToolId: string }
  | { type: "subagentClear"; id: number; parentToolId: string }
  | { type: "characterSpritesLoaded"; characters: unknown[] }
  | { type: "floorTilesLoaded"; sprites: unknown[] }
  | { type: "wallTilesLoaded"; sets: unknown[] }
  | { type: "furnitureAssetsLoaded"; catalog: unknown[]; sprites: Record<string, unknown> }
  | { type: "layoutLoaded"; layout: unknown; version: number; wasReset?: boolean; backupFileName?: string }
  | { type: "settingsLoaded"; soundEnabled: boolean; externalAssetDirectories: string[]; githubTasks: GithubTasksConfig; characterPackDirectory?: string; enabledCharacterIndexes?: number[]; serverMode?: string }
  | { type: "externalAssetDirectoriesUpdated"; dirs: string[] }
  | { type: "agentStats"; id: number; model?: string; totalInputTokens: number; totalOutputTokens: number; totalCacheRead: number; totalCacheCreation: number; currentContextTokens?: number; currentContextLimit?: number; turnCount: number; totalDurationMs: number; cacheHitRate: number }
  | { type: "agentDetails"; id: number; model?: string; gitBranch?: string; cwd?: string; sessionId: string; version?: string; permissionMode?: string; toolHistory: Array<{ name: string; timestamp: string; durationMs?: number }>; tokenBreakdown: { input: number; output: number; cacheRead: number; cacheCreation: number }; contextUsage?: { input: number; output: number; cacheRead: number; total: number; limit: number }; turnCount: number; totalDurationMs: number; startTime?: string }
  | { type: "agentRenamed"; id: number; folderName: string }
  | { type: "agentRole"; id: number; role: string; autoDetected: boolean; colors: { primary: string; badge: string } }
  | { type: "pipelineIssues"; issues: Array<{ number: number; title: string; labels: string[]; state: string; pipelineState: string; repo: string; gates: Array<{ gate: number; status: string; comment: string; timestamp: string }> }> }
  | { type: "agentConversation"; id: number; messages: Array<{ role: string; text: string; timestamp: string; toolNames?: string[] }> }
  | { type: "agentConversationUpdate"; id: number; message: { role: string; text: string; timestamp: string; toolNames?: string[] } }
  | { type: "agentSendMessage"; id: number; toolId: string; from: string; to: string; message: string; timestamp: number }
  | { type: "shareLinkCreated"; token: string; url: string; expiresAt: number; durationMs: number }
  | { type: "shareLinkRevoked"; token: string }
  | { type: "activeShareLinks"; links: Array<{ token: string; expiresAt: number; durationMs: number }> }
  | { type: "daemonStatus"; daemons: Array<{ name: string; url: string; connected: boolean; agentCount: number }> };

// Messages sent from client to server
export type ClientMessage =
  | { type: "ready" }
  | { type: "webviewReady" }
  | { type: "saveLayout"; layout: unknown }
  | { type: "restoreLayoutBackup" }
  | { type: "saveAgentSeats"; seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> }
  | { type: "saveSoundEnabled"; enabled: boolean }
  | { type: "openSessionsFolder" }
  | { type: "addExternalAssetDirectory"; path: string }
  | { type: "removeExternalAssetDirectory"; path: string }
  | { type: "openClaude" }
  | { type: "openClaudeBypass" }
  | { type: "reattachAgent"; id: number }
  | { type: "focusAgent"; id: number }
  | { type: "listSessions" }
  | { type: "resumeSession"; session: SessionHistoryItem }
  | { type: "controlAgent"; id: number; action: "prompt" | "approve" | "deny" | "interrupt"; prompt?: string; expectedPid?: number; expectedProcessStartTime?: string; expectedTmuxTarget?: string }
  | { type: "requestAgentDetails"; id: number }
  | { type: "requestAgentConversation"; id: number }
  | { type: "setAgentRole"; id: number; role: string }
  | { type: "createShareLink"; durationMs: number }
  | { type: "revokeShareLink"; token: string }
  | { type: "addDaemon"; url: string; name: string }
  | { type: "removeDaemon"; url: string }
  | { type: "toggleDaemon"; url: string; enabled: boolean }
  | { type: "getDaemonStatus" }
  | { type: "saveDesktopNotifications"; enabled: boolean }
  | { type: "saveEnabledCharacterIndexes"; indexes: number[] };
