import assert from "node:assert/strict";
import { cleanupAgentParserState, processTranscriptLine } from "../server/parser.js";
import type { TrackedAgent } from "../server/types.js";

function makeAgent(): TrackedAgent {
  return {
    key: "claude:test", provider: "claude", id: 1, sessionId: "test", projectDir: "/tmp", projectName: "test",
    jsonlFile: "/tmp/test.jsonl", fileOffset: 0, lineBuffer: "", activity: "idle", activeTools: new Map(), activeToolNames: new Map(),
    activeSubagentToolIds: new Map(), activeSubagentToolNames: new Map(), isWaiting: false, permissionSent: false, hadToolsInTurn: false,
    lastActivityTime: Date.now(), totalInputTokens: 0, totalOutputTokens: 0, totalCacheRead: 0, totalCacheCreation: 0, turnCount: 0,
    totalDurationMs: 0, toolHistory: [], conversation: [],
  };
}

function assistantTools(...tools: Array<{ id: string; name: string }>): string {
  return JSON.stringify({ type: "assistant", message: { content: tools.map((tool) => ({ type: "tool_use", id: tool.id, name: tool.name, input: {} })) } });
}

function toolResult(...ids: string[]): string {
  return JSON.stringify({ type: "user", message: { content: ids.map((tool_use_id) => ({ type: "tool_result", tool_use_id, content: "done" })) } });
}

const emit = () => {};
const sequential = makeAgent();
processTranscriptLine(assistantTools({ id: "one", name: "Read" }), sequential, emit);
processTranscriptLine(toolResult("one"), sequential, emit);
assert.equal(sequential.toolHistory.find((entry) => entry.toolId === "one")?.durationMs !== undefined, true);

const parallel = makeAgent();
processTranscriptLine(assistantTools({ id: "first", name: "Read" }, { id: "second", name: "Bash" }), parallel, emit);
processTranscriptLine(toolResult("second"), parallel, emit);
assert.equal(parallel.toolHistory.find((entry) => entry.toolId === "second")?.durationMs !== undefined, true);
assert.equal(parallel.toolHistory.find((entry) => entry.toolId === "first")?.durationMs, undefined);
processTranscriptLine(toolResult("first"), parallel, emit);
assert.equal(parallel.toolHistory.find((entry) => entry.toolId === "first")?.durationMs !== undefined, true);
cleanupAgentParserState(sequential.id);
cleanupAgentParserState(parallel.id);
console.log("tool duration tests passed: sequential and out-of-order parallel completion");
