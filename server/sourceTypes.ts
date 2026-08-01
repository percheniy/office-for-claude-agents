/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

export type AgentProvider = "claude" | "codex" | "opencode" | "copilot" | (string & {});

export type GenericAgentEventKind =
  | "session_start"
  | "session_end"
  | "tool_start"
  | "tool_end"
  | "message"
  | "stats"
  | "status"
  | "parent";

export interface GenericAgentEvent {
  kind: GenericAgentEventKind;
  provider?: AgentProvider;
  sessionId?: string;
  parentSessionId?: string;
  projectDir?: string;
  projectName?: string;
  model?: string;
  role?: string;
  toolId?: string;
  toolName?: string;
  toolStatus?: string;
  input?: unknown;
  status?: string;
  messageRole?: "assistant" | "user";
  text?: string;
  timestamp?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  contextTokens?: number;
  contextLimit?: number;
}

/** Small normalized contract for providers that emit local JSONL events. */
export interface AgentSource {
  readonly provider: AgentProvider;
  readonly displayName: string;
  start(): void;
  stop(): void;
  getActiveFiles(): WatchedFile[];
}

export interface WatchedFile {
  provider: AgentProvider;
  path: string;
  sessionId: string;
  projectDir: string;
  projectName: string;
  offset: number;
  lineBuffer: string;
  parentSessionId?: string;
  agentType?: string;
  agentDescription?: string;
  model?: string;
}
