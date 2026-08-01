import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CopilotSource, GenericHookSource, GenericJsonlSource, OpenCodeSource } from "../server/genericSource.js";
import { parseGenericAgentEvent } from "../server/genericParser.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testSource(source: GenericJsonlSource, filePath: string, provider: string): Promise<void> {
  const added: Array<{ provider: string; sessionId: string }> = [];
  const lines: string[] = [];
  const removed: string[] = [];
  source.on("fileAdded", (file) => added.push({ provider: file.provider, sessionId: file.sessionId }));
  source.on("line", (_file, line) => lines.push(line));
  source.on("fileRemoved", (file) => removed.push(file.sessionId));
  source.start();
  await wait(100);
  assert.deepEqual(added, [{ provider, sessionId: `${provider}-session` }]);
  assert.equal(lines.length, 2);
  rmSync(filePath);
  await wait(3200);
  assert.deepEqual(removed, [`${provider}-session`]);
  source.stop();
}

const tempRoot = mkdtempSync(join(tmpdir(), "office-provider-adapters-"));
try {
  const opencodeRoot = join(tempRoot, "opencode");
  const copilotRoot = join(tempRoot, "copilot");
  const genericRoot = join(tempRoot, "generic");
  mkdirSync(opencodeRoot, { recursive: true });
  mkdirSync(copilotRoot, { recursive: true });
  mkdirSync(genericRoot, { recursive: true });

  const opencodeFile = join(opencodeRoot, "session.jsonl");
  process.env.PIXEL_AGENTS_OPENCODE_SESSION_DIR = opencodeRoot;
  writeFileSync(opencodeFile, [
    JSON.stringify({ provider: "opencode", sessionId: "opencode-session", kind: "session_start", model: "kimi-k2" }),
    JSON.stringify({ kind: "tool_start", toolId: "tool-1", toolName: "read" }),
  ].join("\n") + "\n");
  await testSource(new OpenCodeSource(), opencodeFile, "opencode");

  const copilotFile = join(copilotRoot, "events.jsonl");
  process.env.PIXEL_AGENTS_COPILOT_SESSION_DIR = copilotRoot;
  writeFileSync(copilotFile, [
    JSON.stringify({ provider: "copilot", session_id: "copilot-session", event: "session_start" }),
    JSON.stringify({ event: "assistant.message", session_id: "copilot-session", text: "done" }),
  ].join("\n") + "\n");
  await testSource(new CopilotSource(), copilotFile, "copilot");

  const genericFile = join(genericRoot, "future.jsonl");
  process.env.PIXEL_AGENTS_EVENTS_DIR = genericRoot;
  writeFileSync(genericFile, JSON.stringify({ provider: "gemini", sessionId: "gemini-session", kind: "session_start" }) + "\n");
  const generic = new GenericHookSource();
  const genericAdded: string[] = [];
  generic.on("fileAdded", (file) => genericAdded.push(file.provider));
  generic.start();
  await wait(100);
  assert.deepEqual(genericAdded, ["gemini"]);
  generic.stop();

  const event = parseGenericAgentEvent(JSON.stringify({
    provider: "future-tool",
    event: "tool_start",
    sessionId: "s1",
    tool: { id: "t1", name: "shell", status: "running" },
  }));
  assert.equal(event?.kind, "tool_start");
  assert.equal(event?.toolId, "t1");
  assert.equal(event?.toolName, "shell");
  console.log("provider adapter tests passed: OpenCode, Copilot, and generic future-provider lifecycle");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
