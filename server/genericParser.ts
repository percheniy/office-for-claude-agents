/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import type { AgentProvider, GenericAgentEvent } from "./sourceTypes.js";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function numberValue(...values: unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function normalizeKind(raw: string | undefined): GenericAgentEvent["kind"] | undefined {
  if (!raw) return undefined;
  const kind = raw.toLowerCase().replace(/[.:-]/g, "_");
  if (["session_start", "start", "session_created", "session_started"].includes(kind)) return "session_start";
  if (["session_end", "end", "session_closed", "session_completed"].includes(kind)) return "session_end";
  if (["tool_start", "tool_started", "tool_call", "tool_use", "tool_pending"].includes(kind)) return "tool_start";
  if (["tool_end", "tool_ended", "tool_result", "tool_completed", "tool_complete"].includes(kind)) return "tool_end";
  if (["message", "user_message", "assistant_message", "prompt", "response"].includes(kind)) return "message";
  if (["stats", "usage", "token_usage", "token_count"].includes(kind)) return "stats";
  if (["status", "activity", "state"].includes(kind)) return "status";
  if (["parent", "parent_link", "subagent"].includes(kind)) return "parent";
  return undefined;
}

export function parseGenericAgentEvent(line: string): GenericAgentEvent | null {
  let raw: Record<string, unknown>;
  try {
    const parsed = JSON.parse(line) as unknown;
    raw = object(parsed);
  } catch {
    return null;
  }

  const payload = object(raw.payload ?? raw.data ?? raw.properties);
  const info = object(payload.info ?? raw.info);
  const kind = normalizeKind(stringValue(raw.kind, raw.event, raw.type, payload.kind, payload.event, payload.type));
  if (!kind) return null;

  const tool = object(raw.tool ?? payload.tool ?? info.tool);
  const usage = object(raw.usage ?? payload.usage ?? info.usage);
  const roleRaw = stringValue(raw.role, raw.messageRole, payload.role, info.role);
  const messageRole = roleRaw === "user" ? "user" : roleRaw === "assistant" ? "assistant" : undefined;

  return {
    kind,
    provider: stringValue(raw.provider, payload.provider) as AgentProvider | undefined,
    sessionId: stringValue(raw.sessionId, raw.session_id, payload.sessionId, payload.session_id, info.sessionId),
    parentSessionId: stringValue(raw.parentSessionId, raw.parent_session_id, payload.parentSessionId, payload.parent_session_id),
    projectDir: stringValue(raw.projectDir, raw.cwd, payload.projectDir, payload.cwd, info.cwd),
    projectName: stringValue(raw.projectName, raw.name, payload.projectName, payload.name),
    model: stringValue(raw.model, payload.model, info.model),
    role: stringValue(raw.roleName, raw.agentRole, payload.roleName, payload.agentRole),
    toolId: stringValue(raw.toolId, raw.tool_id, payload.toolId, payload.tool_id, tool.id, tool.callId, tool.call_id),
    toolName: stringValue(raw.toolName, raw.tool_name, payload.toolName, payload.tool_name, tool.name, tool.tool),
    toolStatus: stringValue(raw.toolStatus, payload.toolStatus, tool.status),
    input: raw.input ?? payload.input ?? tool.input ?? tool.arguments,
    status: stringValue(raw.status, raw.activity, payload.status, payload.activity),
    messageRole,
    text: stringValue(raw.text, raw.message, payload.text, payload.message, info.text),
    timestamp: stringValue(raw.timestamp, raw.createdAt, payload.timestamp, payload.createdAt),
    inputTokens: numberValue(raw.inputTokens, raw.input_tokens, payload.inputTokens, usage.inputTokens, usage.input_tokens),
    outputTokens: numberValue(raw.outputTokens, raw.output_tokens, payload.outputTokens, usage.outputTokens, usage.output_tokens),
    cacheReadTokens: numberValue(raw.cacheReadTokens, raw.cache_read_tokens, payload.cacheReadTokens, usage.cacheReadTokens, usage.cache_read_tokens),
    cacheCreationTokens: numberValue(raw.cacheCreationTokens, raw.cache_creation_tokens, payload.cacheCreationTokens, usage.cacheCreationTokens, usage.cache_creation_tokens),
    contextTokens: numberValue(raw.contextTokens, raw.context_tokens, payload.contextTokens, usage.contextTokens),
    contextLimit: numberValue(raw.contextLimit, raw.context_limit, payload.contextLimit, usage.contextLimit),
  };
}

