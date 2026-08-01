import * as path from "path";
import type { TrackedAgent, ServerMessage } from "./types.js";
import { compactName } from "./utils.js";

const READING_TOOLS = new Set(["Read", "Grep", "Glob", "WebFetch", "WebSearch"]);
const PERMISSION_EXEMPT_TOOLS = new Set(["Task", "AskUserQuestion"]);
const PERMISSION_TIMER_DELAY_MS = 7000;
const TEXT_IDLE_DELAY_MS = 5000;
const TOOL_DONE_DELAY_MS = 300;
const MAX_TOOL_HISTORY = 50;
const MAX_CONVERSATION_MESSAGES = 100;
const MAX_CONVERSATION_TEXT_LENGTH = 3000;
const BASH_COMMAND_DISPLAY_MAX_LENGTH = 30;
const TASK_DESCRIPTION_DISPLAY_MAX_LENGTH = 40;
const SEND_MESSAGE_DISPLAY_MAX_LENGTH = 30;
const SEND_MESSAGE_SIDEBAR_MAX_LENGTH = 200;
const MAX_AGENT_NAME_LENGTH = 15;
const IDLE_ACTIVITY_TIMEOUT_MS = 120_000; // 2 min — long-running tools (builds, tests) need time

const KNOWN_RECORD_TYPES = new Set([
  "assistant", "user", "system", "progress", "agent-name", "custom-title",
  // Claude Code internal record types — safe to ignore
  "permission-mode", "attachment", "file-history-snapshot", "queue-operation",
  "worktree-state", "pr-link", "last-prompt",
]);
// Track warned record types per agent to log only first occurrence
const warnedRecordTypes = new Map<number, Set<string>>();

// Timer maps (module-level)
const waitingTimers = new Map<number, ReturnType<typeof setTimeout>>();
const permissionTimers = new Map<number, ReturnType<typeof setTimeout>>();
const idleTimeoutTimers = new Map<number, ReturnType<typeof setTimeout>>();

// compactName imported from ./utils.js

/** Extract readable text from SendMessage input.message (string or structured object) */
function extractSendMessageText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    // Try common text fields first
    const text = (obj.summary ?? obj.reason ?? obj.text ?? obj.message ?? obj.description) as string | undefined;
    if (typeof text === "string") {
      const prefix = typeof obj.type === "string" ? `${obj.type}: ` : "";
      return prefix + text;
    }
    // For structured responses with type but no text field (e.g. shutdown_response with approve:true)
    if (typeof obj.type === "string") {
      const rest = Object.entries(obj)
        .filter(([k]) => k !== "type" && k !== "request_id")
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      return rest ? `${obj.type}: ${rest}` : (obj.type as string);
    }
    return JSON.stringify(raw);
  }
  return "";
}

function formatToolStatus(toolName: string, input: Record<string, unknown>): string {
  const base = (p: unknown) => (typeof p === "string" ? path.basename(p) : "");
  switch (toolName) {
    case "Read":
      return `Reading ${base(input.file_path)}`;
    case "Edit":
      return `Editing ${base(input.file_path)}`;
    case "Write":
      return `Writing ${base(input.file_path)}`;
    case "Bash": {
      const cmd = (input.command as string) || "";
      return `Running: ${cmd.length > BASH_COMMAND_DISPLAY_MAX_LENGTH ? cmd.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH) + "\u2026" : cmd}`;
    }
    case "Glob":
      return "Searching files";
    case "Grep":
      return "Searching code";
    case "WebFetch":
      return "Fetching web content";
    case "WebSearch":
      return "Searching the web";
    case "Task": {
      const desc = typeof input.description === "string" ? input.description : "";
      return desc
        ? `Subtask: ${desc.length > TASK_DESCRIPTION_DISPLAY_MAX_LENGTH ? desc.slice(0, TASK_DESCRIPTION_DISPLAY_MAX_LENGTH) + "\u2026" : desc}`
        : "Running subtask";
    }
    case "SendMessage": {
      const to = (input.to as string) || "?";
      const msg = extractSendMessageText(input.message);
      const truncMsg = msg.length > SEND_MESSAGE_DISPLAY_MAX_LENGTH ? msg.slice(0, SEND_MESSAGE_DISPLAY_MAX_LENGTH) + "\u2026" : msg;
      return `\u2192 ${to}: ${truncMsg}`;
    }
    case "AskUserQuestion":
      return "Waiting for your answer";
    case "EnterPlanMode":
      return "Planning";
    case "NotebookEdit":
      return "Editing notebook";
    default:
      return `Using ${toolName}`;
  }
}

function cancelTimer(agentId: number, timers: Map<number, ReturnType<typeof setTimeout>>): void {
  const t = timers.get(agentId);
  if (t) {
    clearTimeout(t);
    timers.delete(agentId);
  }
}

function startWaitingTimer(
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  cancelTimer(agent.id, waitingTimers);
  waitingTimers.set(
    agent.id,
    setTimeout(() => {
      waitingTimers.delete(agent.id);
      agent.isWaiting = true;
      agent.hadToolsInTurn = false;
      emit({ type: "agentStatus", id: agent.id, status: "waiting" });
    }, TEXT_IDLE_DELAY_MS),
  );
}

function startIdleTimeout(
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  cancelTimer(agent.id, idleTimeoutTimers);
  idleTimeoutTimers.set(
    agent.id,
    setTimeout(() => {
      idleTimeoutTimers.delete(agent.id);
      if (agent.activity !== "idle" && agent.activity !== "waiting") {
        clearAgentActivity(agent, emit);
        agent.isWaiting = true;
        agent.hadToolsInTurn = false;
        agent.activity = "waiting";
        emit({ type: "agentStatus", id: agent.id, status: "waiting" });
      }
    }, IDLE_ACTIVITY_TIMEOUT_MS),
  );
}

function startPermissionTimer(
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  cancelTimer(agent.id, permissionTimers);
  permissionTimers.set(
    agent.id,
    setTimeout(() => {
      permissionTimers.delete(agent.id);
      // Check if there are still active non-exempt tools
      let hasNonExempt = false;
      for (const [, toolName] of agent.activeToolNames) {
        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
          hasNonExempt = true;
          break;
        }
      }
      if (!hasNonExempt) {
        // Also check subagent tools
        for (const [, subNames] of agent.activeSubagentToolNames) {
          for (const [, toolName] of subNames) {
            if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
              hasNonExempt = true;
              break;
            }
          }
          if (hasNonExempt) break;
        }
      }
      if (hasNonExempt && !agent.permissionSent) {
        agent.permissionSent = true;
        emit({ type: "agentToolPermission", id: agent.id });
      }
    }, PERMISSION_TIMER_DELAY_MS),
  );
}

export function processTranscriptLine(
  line: string,
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
  onStatsUpdate?: (agent: TrackedAgent) => void,
): void {
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(line);
  } catch {
    return;
  }

  const type = record.type as string;

  // Extract metadata from any record (first occurrence)
  let statsChanged = false;
  if (!agent.startTime && typeof record.timestamp === "string") {
    agent.startTime = record.timestamp as string;
    statsChanged = true;
  }
  if (!agent.gitBranch && typeof record.gitBranch === "string") {
    agent.gitBranch = record.gitBranch as string;
    statsChanged = true;
  }
  if (!agent.cwd && typeof record.cwd === "string") {
    agent.cwd = record.cwd as string;
    statsChanged = true;
  }
  if (!agent.version && typeof record.version === "string") {
    agent.version = record.version as string;
    statsChanged = true;
  }
  // Extract agentSetting — the REAL role assigned by Claude Code
  if (!agent.agentSetting && typeof record.agentSetting === "string") {
    agent.agentSetting = record.agentSetting as string;
    statsChanged = true;
  }

  // Extract teamName from any record — teammate sessions have this on every line
  if (!agent.teamName && typeof record.teamName === "string" && record.teamName) {
    agent.teamName = record.teamName as string;
    agent.isTeamLead = !record.agentName;
    // Rename team lead from "MegaBoss" to teamName-based name
    if (agent.isTeamLead && agent.nameSource === "fallback") {
      const truncated = compactName(record.teamName as string, MAX_AGENT_NAME_LENGTH);
      agent.projectName = truncated;
      agent.nameSource = "derived";
      emit({ type: "agentRenamed", id: agent.id, folderName: truncated });
    }
    statsChanged = true;
  }

  // Extract agentName from any record — teammate sessions have this on every line
  if (agent.nameSource !== "explicit" && typeof record.agentName === "string" && record.agentName) {
    const truncated = compactName(record.agentName as string, MAX_AGENT_NAME_LENGTH);
    if (agent.projectName !== truncated) {
      agent.projectName = truncated;
      agent.nameSource = "derived";
      emit({ type: "agentRenamed", id: agent.id, folderName: truncated });
      statsChanged = true;
    }
  }

  // Handle agent-name records — Claude CLI writes these with the session's display name
  if (type === "agent-name") {
    const agentName = record.agentName as string | undefined;
    if (agentName && typeof agentName === "string") {
      const truncated = compactName(agentName, MAX_AGENT_NAME_LENGTH);
      const changed = agent.projectName !== truncated || agent.nameSource !== "explicit";
      agent.projectName = truncated;
      agent.nameSource = "explicit";
      if (changed) {
        emit({ type: "agentRenamed", id: agent.id, folderName: truncated });
        statsChanged = true;
      }
    }
  }

  // Handle custom-title records — Claude CLI auto-generates descriptive session titles
  if (type === "custom-title") {
    const customTitle = record.customTitle as string | undefined;
    if (customTitle && typeof customTitle === "string" && agent.nameSource !== "explicit") {
      const truncated = compactName(customTitle, MAX_AGENT_NAME_LENGTH);
      if (agent.projectName !== truncated) {
        agent.projectName = truncated;
        agent.nameSource = "derived";
        emit({ type: "agentRenamed", id: agent.id, folderName: truncated });
        statsChanged = true;
      }
    }
  }

  if (type === "assistant") {
    const tokenStatsChanged = extractTokenUsage(record, agent);
    statsChanged = statsChanged || tokenStatsChanged;
    handleAssistantMessage(record, agent, emit);
  } else if (type === "user") {
    handleUserMessage(record, agent, emit);
  } else if (type === "system") {
    const durationChanged = extractTurnDuration(record, agent);
    statsChanged = statsChanged || durationChanged;
    handleSystemMessage(record, agent, emit);
  } else if (type === "progress") {
    handleProgressMessage(record, agent, emit);
  } else if (type && !KNOWN_RECORD_TYPES.has(type)) {
    // Log unrecognized record types (first occurrence per agent)
    let warned = warnedRecordTypes.get(agent.id);
    if (!warned) {
      warned = new Set();
      warnedRecordTypes.set(agent.id, warned);
    }
    if (!warned.has(type)) {
      warned.add(type);
      console.warn(
        `[parser] Agent ${agent.id} (${agent.projectName}): unrecognized JSONL record type "${type}"`,
      );
    }
  }

  if (statsChanged && onStatsUpdate) {
    onStatsUpdate(agent);
  }
}

function extractTokenUsage(
  record: Record<string, unknown>,
  agent: TrackedAgent,
): boolean {
  const message = record.message as Record<string, unknown> | undefined;
  if (!message) return false;

  let changed = false;

  // Extract model
  if (typeof message.model === "string" && !agent.model) {
    agent.model = message.model as string;
    changed = true;
  }

  // Extract usage
  const usage = message.usage as Record<string, unknown> | undefined;
  if (usage) {
    if (typeof usage.input_tokens === "number") {
      agent.totalInputTokens += usage.input_tokens as number;
      changed = true;
    }
    if (typeof usage.output_tokens === "number") {
      agent.totalOutputTokens += usage.output_tokens as number;
      changed = true;
    }
    if (typeof usage.cache_read_input_tokens === "number") {
      agent.totalCacheRead += usage.cache_read_input_tokens as number;
      changed = true;
    }
    if (typeof usage.cache_creation_input_tokens === "number") {
      agent.totalCacheCreation += usage.cache_creation_input_tokens as number;
      changed = true;
    }
  }

  return changed;
}

function extractTurnDuration(
  record: Record<string, unknown>,
  agent: TrackedAgent,
): boolean {
  const subtype = record.subtype as string | undefined;
  if (subtype !== "turn_duration") return false;

  let changed = false;
  if (typeof record.durationMs === "number") {
    agent.totalDurationMs += record.durationMs as number;
    agent.turnCount += 1;
    changed = true;
  }
  return changed;
}

function handleAssistantMessage(
  record: Record<string, unknown>,
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  const message = record.message as Record<string, unknown> | undefined;
  if (!message?.content) return;

  const content = message.content as Array<Record<string, unknown>>;
  if (!Array.isArray(content)) return;

  const hasToolUse = content.some((b) => b.type === "tool_use");

  // Extract text blocks for conversation history
  const textBlocks = content.filter((b) => b.type === "text" && b.text);
  if (textBlocks.length > 0) {
    const fullText = textBlocks.map((b) => b.text as string).join("\n");
    const truncated = fullText.length > MAX_CONVERSATION_TEXT_LENGTH
      ? fullText.slice(0, MAX_CONVERSATION_TEXT_LENGTH) + "\u2026"
      : fullText;
    const toolNames = content
      .filter((b) => b.type === "tool_use")
      .map((b) => (b.name as string) || "unknown");
    const convMsg = {
      role: "assistant" as const,
      text: truncated,
      timestamp: (record.timestamp as string) || new Date().toISOString(),
      toolNames: toolNames.length > 0 ? toolNames : undefined,
    };
    agent.conversation.push(convMsg);
    if (agent.conversation.length > MAX_CONVERSATION_MESSAGES) {
      agent.conversation.shift();
    }
    emit({ type: "agentConversationUpdate", id: agent.id, message: convMsg });
  }

  if (hasToolUse) {
    cancelTimer(agent.id, waitingTimers);
    agent.isWaiting = false;
    agent.hadToolsInTurn = true;
    emit({ type: "agentStatus", id: agent.id, status: "active" });

    let hasNonExemptTool = false;
    for (const block of content) {
      if (block.type === "tool_use" && block.id) {
        const toolId = block.id as string;
        const toolName = (block.name as string) || "";
        const input = (block.input as Record<string, unknown>) || {};
        const status = formatToolStatus(toolName, input);

        agent.activeTools.set(toolId, { toolId, toolName, status });
        agent.activeToolNames.set(toolId, toolName);
        agent.lastActivityTime = Date.now();

        // Track tool history (ring buffer)
        if (agent.toolHistory.length >= MAX_TOOL_HISTORY) {
          agent.toolHistory.shift();
        }
        agent.toolHistory.push({ toolId, name: toolName, timestamp: new Date().toISOString() });

        // Track tool counts for role detection
        if (!agent.toolCounts) agent.toolCounts = {};
        agent.toolCounts[toolName] = (agent.toolCounts[toolName] || 0) + 1;

        const activity = READING_TOOLS.has(toolName) ? "reading" : "typing";
        agent.activity = activity;

        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
          hasNonExemptTool = true;
        }

        emit({ type: "agentToolStart", id: agent.id, toolId, status });

        // Emit dedicated SendMessage event for inter-agent communication
        if (toolName === "SendMessage") {
          const toAgent = (input.to as string) || "?";
          const msgText = extractSendMessageText(input.message);
          const truncated = msgText.length > SEND_MESSAGE_SIDEBAR_MAX_LENGTH
            ? msgText.slice(0, SEND_MESSAGE_SIDEBAR_MAX_LENGTH) + "\u2026"
            : msgText;
          const senderName = agent.role || agent.agentSetting || agent.projectName;
          emit({
            type: "agentSendMessage",
            id: agent.id,
            toolId,
            from: senderName,
            to: toAgent,
            message: truncated,
            timestamp: Date.now(),
          });
        }

        // Detect scratchboard writes via Bash tool
        if (toolName === "Bash" && typeof input.command === "string" && input.command.includes("scratchboard.py write")) {
          const cmd = input.command as string;
          // Match both quoted and unquoted args
          const agentMatch = cmd.match(/--agent\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
          const contentMatch = cmd.match(/--content\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
          const agentName = agentMatch?.[1] || agentMatch?.[2] || agentMatch?.[3];
          const contentText = contentMatch?.[1] || contentMatch?.[2] || contentMatch?.[3];
          if (contentText) {
            const content = contentText;
            const senderName = agent.role || agent.agentSetting || agent.projectName;
            emit({
              type: "agentSendMessage",
              id: agent.id,
              toolId,
              from: senderName,
              to: "scratchboard",
              message: "\uD83D\uDCCB " + (content.length > 200 ? content.slice(0, 200) + "\u2026" : content),
              timestamp: Date.now(),
            });
          }
        }
      }
    }
    if (hasNonExemptTool) {
      agent.permissionSent = false;
      startPermissionTimer(agent, emit);
    }
    startIdleTimeout(agent, emit);
  } else if (content.some((b) => b.type === "text") && !agent.hadToolsInTurn) {
    // Text-only response — use silence-based idle detection
    startWaitingTimer(agent, emit);
  }
}

function handleUserMessage(
  record: Record<string, unknown>,
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  // Extract permissionMode from user records
  if (!agent.permissionMode && typeof record.permissionMode === "string") {
    agent.permissionMode = record.permissionMode as string;
  }

  const message = record.message as Record<string, unknown> | undefined;
  if (!message?.content) return;

  const content = message.content;
  if (Array.isArray(content)) {
    const blocks = content as Array<Record<string, unknown>>;
    const hasToolResult = blocks.some((b) => b.type === "tool_result");

    if (hasToolResult) {
      for (const block of blocks) {
        if (block.type === "tool_result" && block.tool_use_id) {
          const completedToolId = block.tool_use_id as string;

          // If completed tool was a Task, clear its subagent tools
          if (agent.activeToolNames.get(completedToolId) === "Task") {
            agent.activeSubagentToolIds.delete(completedToolId);
            agent.activeSubagentToolNames.delete(completedToolId);
            emit({
              type: "subagentClear",
              id: agent.id,
              parentToolId: completedToolId,
            });
          }

          agent.activeTools.delete(completedToolId);
          agent.activeToolNames.delete(completedToolId);

          // Update tool history with duration
          for (let i = agent.toolHistory.length - 1; i >= 0; i--) {
            const entry = agent.toolHistory[i];
            if (entry.toolId === completedToolId && entry.durationMs === undefined) {
              const startMs = new Date(entry.timestamp).getTime();
              entry.durationMs = Date.now() - startMs;
              break;
            }
          }

          // Delay the done message slightly (matches upstream)
          const toolId = completedToolId;
          setTimeout(() => {
            emit({ type: "agentToolDone", id: agent.id, toolId });
          }, TOOL_DONE_DELAY_MS);
        }
      }
      if (agent.activeTools.size === 0) {
        agent.hadToolsInTurn = false;
      }
    } else {
      // New user text prompt — new turn starting
      cancelTimer(agent.id, waitingTimers);
      cancelTimer(agent.id, idleTimeoutTimers);
      clearAgentActivity(agent, emit);
      agent.hadToolsInTurn = false;
      // Extract user prompt text for conversation history
      const userTextBlocks = blocks.filter((b) => b.type === "text" && b.text);
      if (userTextBlocks.length > 0) {
        const fullText = userTextBlocks.map((b) => b.text as string).join("\n");
        const truncated = fullText.length > MAX_CONVERSATION_TEXT_LENGTH
          ? fullText.slice(0, MAX_CONVERSATION_TEXT_LENGTH) + "\u2026"
          : fullText;
        const convMsg = {
          role: "user" as const,
          text: truncated,
          timestamp: (record.timestamp as string) || new Date().toISOString(),
        };
        agent.conversation.push(convMsg);
        if (agent.conversation.length > MAX_CONVERSATION_MESSAGES) {
          agent.conversation.shift();
        }
        emit({ type: "agentConversationUpdate", id: agent.id, message: convMsg });
      }
    }
  } else if (typeof content === "string" && (content as string).trim()) {
    cancelTimer(agent.id, waitingTimers);
    cancelTimer(agent.id, idleTimeoutTimers);
    clearAgentActivity(agent, emit);
    agent.hadToolsInTurn = false;
    // Plain string user prompt
    const text = content as string;
    const truncated = text.length > MAX_CONVERSATION_TEXT_LENGTH
      ? text.slice(0, MAX_CONVERSATION_TEXT_LENGTH) + "\u2026"
      : text;
    const convMsg = {
      role: "user" as const,
      text: truncated,
      timestamp: (record.timestamp as string) || new Date().toISOString(),
    };
    agent.conversation.push(convMsg);
    if (agent.conversation.length > MAX_CONVERSATION_MESSAGES) {
      agent.conversation.shift();
    }
    emit({ type: "agentConversationUpdate", id: agent.id, message: convMsg });
  }
}

function handleSystemMessage(
  record: Record<string, unknown>,
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  const subtype = record.subtype as string | undefined;

  if (subtype === "turn_duration") {
    cancelTimer(agent.id, waitingTimers);
    cancelTimer(agent.id, permissionTimers);
    cancelTimer(agent.id, idleTimeoutTimers);

    if (agent.activeTools.size > 0) {
      agent.activeTools.clear();
      agent.activeToolNames.clear();
      agent.activeSubagentToolIds.clear();
      agent.activeSubagentToolNames.clear();
      emit({ type: "agentToolsClear", id: agent.id });
    }

    agent.isWaiting = true;
    agent.permissionSent = false;
    agent.hadToolsInTurn = false;
    agent.activity = "waiting";
    emit({ type: "agentStatus", id: agent.id, status: "waiting" });
  }
}

function handleProgressMessage(
  record: Record<string, unknown>,
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  const parentToolId = record.parentToolUseID as string | undefined;
  if (!parentToolId) return;

  const data = record.data as Record<string, unknown> | undefined;
  if (!data) return;

  const dataType = data.type as string | undefined;

  // bash_progress / mcp_progress: restart permission timer
  if (dataType === "bash_progress" || dataType === "mcp_progress") {
    if (agent.activeTools.has(parentToolId)) {
      startPermissionTimer(agent, emit);
    }
    return;
  }

  // Only handle subagent progress for Task tools
  if (agent.activeToolNames.get(parentToolId) !== "Task") return;

  const msg = data.message as Record<string, unknown> | undefined;
  if (!msg) return;

  const msgType = msg.type as string;
  const innerMsg = msg.message as Record<string, unknown> | undefined;
  const content = innerMsg?.content;
  if (!Array.isArray(content)) return;

  if (msgType === "assistant") {
    let hasNonExemptSubTool = false;
    for (const block of content as Array<Record<string, unknown>>) {
      if (block.type === "tool_use" && block.id) {
        const toolId = block.id as string;
        const toolName = (block.name as string) || "";
        const input = (block.input as Record<string, unknown>) || {};
        const status = formatToolStatus(toolName, input);

        let subTools = agent.activeSubagentToolIds.get(parentToolId);
        if (!subTools) {
          subTools = new Set();
          agent.activeSubagentToolIds.set(parentToolId, subTools);
        }
        subTools.add(toolId);

        let subNames = agent.activeSubagentToolNames.get(parentToolId);
        if (!subNames) {
          subNames = new Map();
          agent.activeSubagentToolNames.set(parentToolId, subNames);
        }
        subNames.set(toolId, toolName);

        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
          hasNonExemptSubTool = true;
        }

        emit({
          type: "subagentToolStart",
          id: agent.id,
          parentToolId,
          toolId,
          status,
        });
      }
    }
    if (hasNonExemptSubTool) {
      startPermissionTimer(agent, emit);
    }
  } else if (msgType === "user") {
    for (const block of content as Array<Record<string, unknown>>) {
      if (block.type === "tool_result" && block.tool_use_id) {
        const toolId = block.tool_use_id as string;
        const subTools = agent.activeSubagentToolIds.get(parentToolId);
        if (subTools) subTools.delete(toolId);
        const subNames = agent.activeSubagentToolNames.get(parentToolId);
        if (subNames) subNames.delete(toolId);

        setTimeout(() => {
          emit({
            type: "subagentToolDone",
            id: agent.id,
            parentToolId,
            toolId,
          });
        }, TOOL_DONE_DELAY_MS);
      }
    }
  }
}

/** Clean up parser state when an agent is removed */
export function cleanupAgentParserState(agentId: number): void {
  warnedRecordTypes.delete(agentId);
  waitingTimers.get(agentId) && clearTimeout(waitingTimers.get(agentId)!);
  waitingTimers.delete(agentId);
  permissionTimers.get(agentId) && clearTimeout(permissionTimers.get(agentId)!);
  permissionTimers.delete(agentId);
  idleTimeoutTimers.get(agentId) && clearTimeout(idleTimeoutTimers.get(agentId)!);
  idleTimeoutTimers.delete(agentId);
}

function clearAgentActivity(
  agent: TrackedAgent,
  emit: (msg: ServerMessage) => void,
): void {
  cancelTimer(agent.id, permissionTimers);
  cancelTimer(agent.id, idleTimeoutTimers);
  if (agent.activeTools.size > 0) {
    agent.activeTools.clear();
    agent.activeToolNames.clear();
    agent.activeSubagentToolIds.clear();
    agent.activeSubagentToolNames.clear();
    emit({ type: "agentToolsClear", id: agent.id });
  }
  if (agent.permissionSent) {
    agent.permissionSent = false;
    emit({ type: "agentToolPermissionClear", id: agent.id });
  }
  agent.activity = "idle";
}
