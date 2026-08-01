/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import type { TrackedAgent, ServerMessage } from "./types.js";

const MAX_TOOL_HISTORY = 50;
const MAX_CONVERSATION_MESSAGES = 100;
const MAX_SEND_MESSAGE_LENGTH = 200;
const MAX_COMMAND_LENGTH = 40;

interface CodexSubagentHint {
  sessionId: string;
  parentSessionId: string;
  nickname?: string;
  role?: string;
}

interface CodexParserOptions {
  emit: (msg: ServerMessage) => void;
  onStatsUpdate?: (agent: TrackedAgent) => void;
  onSubagentHint?: (hint: CodexSubagentHint) => void;
  resolveSessionLabel?: (sessionId: string) => string | undefined;
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function extractMessageText(content: unknown): string {
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.text === "string") {
      parts.push(record.text);
    } else if (typeof record.output === "string") {
      parts.push(record.output);
    } else if (typeof record.input === "string") {
      parts.push(record.input);
    }
  }

  return parts.join("\n").trim();
}

function formatCodexToolStatus(toolName: string, rawArguments: unknown, resolveSessionLabel?: (sessionId: string) => string | undefined): string {
  const args = parseJsonObject(rawArguments);

  switch (toolName) {
    case "exec_command": {
      const command = typeof args.cmd === "string" ? args.cmd : "";
      return command ? `Running: ${truncateText(command, MAX_COMMAND_LENGTH)}` : "Running command";
    }
    case "write_stdin": {
      const chars = typeof args.chars === "string" ? args.chars : "";
      return chars.trim() ? "Streaming command input" : "Polling command";
    }
    case "spawn_agent": {
      const agentType = typeof args.agent_type === "string" ? args.agent_type : "agent";
      return `Spawning ${agentType}`;
    }
    case "wait_agent": {
      const targets = Array.isArray(args.targets) ? args.targets : [];
      return `Waiting for ${targets.length || 1} agents`;
    }
    case "send_input": {
      const target = typeof args.target === "string" ? resolveSessionLabel?.(args.target) ?? "agent" : "agent";
      return `Sending task to ${target}`;
    }
    case "request_user_input":
      return "Waiting for your answer";
    default:
      return `Using ${toolName}`;
  }
}

function pushConversationMessage(
  agent: TrackedAgent,
  role: "assistant" | "user",
  text: string,
  timestamp: string,
  emit: (msg: ServerMessage) => void,
): void {
  if (!text) return;

  const message = { role, text, timestamp };
  agent.conversation.push(message);
  if (agent.conversation.length > MAX_CONVERSATION_MESSAGES) {
    agent.conversation.shift();
  }

  emit({
    type: "agentConversationUpdate",
    id: agent.id,
    message,
  });
}

function updateDuration(agent: TrackedAgent, timestamp: string | undefined): void {
  if (!agent.startTime || !timestamp) return;

  const startMs = Date.parse(agent.startTime);
  const currentMs = Date.parse(timestamp);
  if (Number.isFinite(startMs) && Number.isFinite(currentMs) && currentMs >= startMs) {
    agent.totalDurationMs = currentMs - startMs;
  }
}

function setCodexTokenUsageFromTotals(
  totals: Record<string, unknown>,
  agent: TrackedAgent,
): boolean {
  let changed = false;

  if (typeof totals.input_tokens === "number" && agent.totalInputTokens !== totals.input_tokens) {
    agent.totalInputTokens = totals.input_tokens;
    changed = true;
  }
  if (typeof totals.output_tokens === "number" && agent.totalOutputTokens !== totals.output_tokens) {
    agent.totalOutputTokens = totals.output_tokens;
    changed = true;
  }
  if (typeof totals.cached_input_tokens === "number" && agent.totalCacheRead !== totals.cached_input_tokens) {
    agent.totalCacheRead = totals.cached_input_tokens;
    changed = true;
  }

  return changed;
}

function setCodexContextUsage(
  lastUsage: Record<string, unknown>,
  contextWindow: unknown,
  agent: TrackedAgent,
): boolean {
  let changed = false;

  const inputTokens = typeof lastUsage.input_tokens === "number" ? lastUsage.input_tokens : 0;
  const outputTokens = typeof lastUsage.output_tokens === "number" ? lastUsage.output_tokens : 0;
  const cacheRead = typeof lastUsage.cached_input_tokens === "number" ? lastUsage.cached_input_tokens : 0;
  const totalTokens = typeof lastUsage.total_tokens === "number" ? lastUsage.total_tokens : inputTokens + outputTokens;

  if (agent.currentInputTokens !== inputTokens) {
    agent.currentInputTokens = inputTokens;
    changed = true;
  }
  if (agent.currentOutputTokens !== outputTokens) {
    agent.currentOutputTokens = outputTokens;
    changed = true;
  }
  if (agent.currentCacheRead !== cacheRead) {
    agent.currentCacheRead = cacheRead;
    changed = true;
  }
  if (agent.currentContextTokens !== totalTokens) {
    agent.currentContextTokens = totalTokens;
    changed = true;
  }
  if (typeof contextWindow === "number" && agent.currentContextLimit !== contextWindow) {
    agent.currentContextLimit = contextWindow;
    changed = true;
  }

  return changed;
}

function finishCodexTool(
  agent: TrackedAgent,
  callId: string,
  timestamp: string | undefined,
  emit: (msg: ServerMessage) => void,
): void {
  const tool = agent.activeTools.get(callId);
  if (!tool) return;

  agent.activeTools.delete(callId);
  agent.activeToolNames.delete(callId);
  emit({ type: "agentToolDone", id: agent.id, toolId: callId });

  if (agent.activeTools.size === 0) {
    agent.activity = "waiting";
    agent.isWaiting = true;
    updateDuration(agent, timestamp);
    emit({ type: "agentStatus", id: agent.id, status: "waiting" });
  }
}

export function processCodexTranscriptLine(
  line: string,
  agent: TrackedAgent,
  options: CodexParserOptions,
): void {
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(line);
  } catch {
    return;
  }

  const timestamp = typeof record.timestamp === "string" ? record.timestamp : undefined;
  if (!agent.startTime && timestamp) {
    agent.startTime = timestamp;
  }

  const { emit, onStatsUpdate, onSubagentHint, resolveSessionLabel } = options;
  const type = record.type as string | undefined;

  if (type === "session_meta") {
    const payload = (record.payload ?? {}) as Record<string, unknown>;
    const cwd = typeof payload.cwd === "string" ? payload.cwd : undefined;
    const version = typeof payload.cli_version === "string" ? payload.cli_version : undefined;
    const source = (payload.source ?? {}) as Record<string, unknown>;
    const subagent = (source.subagent ?? {}) as Record<string, unknown>;
    const threadSpawn = (subagent.thread_spawn ?? {}) as Record<string, unknown>;
    const agentNickname =
      typeof payload.agent_nickname === "string"
        ? payload.agent_nickname
        : typeof threadSpawn.agent_nickname === "string"
          ? threadSpawn.agent_nickname
          : undefined;
    const roleFromMeta =
      typeof threadSpawn.agent_role === "string"
        ? threadSpawn.agent_role
        : typeof payload.agent_role === "string"
          ? payload.agent_role
          : undefined;

    if (cwd) {
      agent.cwd = cwd;
      agent.projectDir = cwd;
    }
    if (version) agent.version = version;
    if (agentNickname) {
      agent.projectName = agentNickname;
      agent.nameSource = "explicit";
    }
    if (roleFromMeta && roleFromMeta !== "default") {
      agent.agentSetting = roleFromMeta;
    }
    if (!agent.parentSessionId && typeof threadSpawn.parent_thread_id === "string") {
      agent.parentSessionId = threadSpawn.parent_thread_id;
    }
    onStatsUpdate?.(agent);
    return;
  }

  if (type === "turn_context") {
    const payload = (record.payload ?? {}) as Record<string, unknown>;
    if (typeof payload.model === "string") {
      agent.model = payload.model;
      onStatsUpdate?.(agent);
    }
    return;
  }

  if (type === "response_item") {
    const payload = (record.payload ?? {}) as Record<string, unknown>;
    const payloadType = payload.type as string | undefined;

    if (payloadType === "function_call") {
      const toolName = payload.name as string | undefined;
      const callId = payload.call_id as string | undefined;
      if (!toolName || !callId) return;

      const status = formatCodexToolStatus(toolName, payload.arguments, resolveSessionLabel);
      agent.activeTools.set(callId, { toolId: callId, toolName, status });
      agent.activeToolNames.set(callId, toolName);
      agent.isWaiting = false;
      agent.activity = "typing";
      agent.toolHistory.push({ toolId: callId, name: toolName, timestamp: timestamp ?? new Date().toISOString() });
      if (agent.toolHistory.length > MAX_TOOL_HISTORY) {
        agent.toolHistory.shift();
      }

      emit({ type: "agentStatus", id: agent.id, status: "active" });
      emit({ type: "agentToolStart", id: agent.id, toolId: callId, status });

      if (toolName === "send_input") {
        const args = parseJsonObject(payload.arguments);
        const targetSessionId = typeof args.target === "string" ? args.target : undefined;
        const to = targetSessionId ? resolveSessionLabel?.(targetSessionId) ?? targetSessionId.slice(0, 8) : "agent";
        const message = typeof args.message === "string" ? truncateText(args.message, MAX_SEND_MESSAGE_LENGTH) : "Message";
        emit({
          type: "agentSendMessage",
          id: agent.id,
          toolId: callId,
          from: agent.projectName,
          to,
          message,
          timestamp: Date.now(),
        });
      }

      if (toolName === "request_user_input") {
        emit({ type: "agentStatus", id: agent.id, status: "waiting" });
      }

      return;
    }

    if (payloadType === "function_call_output") {
      const callId = payload.call_id as string | undefined;
      if (!callId) return;
      finishCodexTool(agent, callId, timestamp, emit);
      return;
    }

    if (payloadType === "message") {
      const role = payload.role === "user" ? "user" : payload.role === "assistant" ? "assistant" : null;
      const content = payload.content;
      const text = extractMessageText(content);
      if (role && text) {
        pushConversationMessage(agent, role, text, timestamp ?? new Date().toISOString(), emit);
        if (role === "assistant" && payload.phase === "final_answer") {
          agent.turnCount += 1;
          updateDuration(agent, timestamp);
          onStatsUpdate?.(agent);
        }
      }
      return;
    }

    return;
  }

  if (type !== "event_msg") return;

  const payload = (record.payload ?? {}) as Record<string, unknown>;
  const eventType = payload.type as string | undefined;

  if (eventType === "collab_agent_spawn_end") {
    const sessionId = typeof payload.new_thread_id === "string" ? payload.new_thread_id : undefined;
    const parentSessionId = typeof payload.sender_thread_id === "string" ? payload.sender_thread_id : undefined;
    if (!sessionId || !parentSessionId) return;

    const nickname = typeof payload.new_agent_nickname === "string" ? payload.new_agent_nickname : undefined;
    const role = typeof payload.new_agent_role === "string" ? payload.new_agent_role : undefined;
    onSubagentHint?.({ sessionId, parentSessionId, nickname, role });
    return;
  }

  if (eventType === "collab_waiting_end") {
    const agentStatuses = Array.isArray(payload.agent_statuses) ? payload.agent_statuses : [];
    for (const statusEntry of agentStatuses) {
      if (!statusEntry || typeof statusEntry !== "object") continue;
      const entry = statusEntry as Record<string, unknown>;
      const sessionId = typeof entry.thread_id === "string" ? entry.thread_id : undefined;
      const nickname = typeof entry.agent_nickname === "string" ? entry.agent_nickname : undefined;
      const role = typeof entry.agent_role === "string" ? entry.agent_role : undefined;
      if (sessionId) {
        onSubagentHint?.({
          sessionId,
          parentSessionId: agent.sessionId,
          nickname,
          role,
        });
      }
    }

    finishCodexTool(agent, payload.call_id as string, timestamp, emit);
    return;
  }

  if (eventType === "token_count") {
    const info = (payload.info ?? {}) as Record<string, unknown>;
    const totalUsage = (info.total_token_usage ?? {}) as Record<string, unknown>;
    const lastUsage = (info.last_token_usage ?? {}) as Record<string, unknown>;
    const didChange =
      setCodexTokenUsageFromTotals(totalUsage, agent) ||
      setCodexContextUsage(lastUsage, info.model_context_window, agent);
    if (didChange) {
      onStatsUpdate?.(agent);
    }
    return;
  }

  if (eventType === "task_complete") {
    if (agent.activeTools.size === 0) {
      agent.isWaiting = true;
      agent.activity = "waiting";
      updateDuration(agent, timestamp);
      emit({ type: "agentStatus", id: agent.id, status: "waiting" });
      onStatsUpdate?.(agent);
    }
  }
}

export function cleanupCodexParserState(): void {
  // Codex parsing is stateless between lines at the moment.
}
