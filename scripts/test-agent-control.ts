import assert from "node:assert/strict";
import { sendAgentControl } from "../server/agentControl.js";

const calls: string[][] = [];
const run = (args: string[]) => { calls.push(args); return true; };
const identity = { tmuxTarget: "dev:0.1", pid: 123, processStartTime: "2026-08-01T12:00:00.000Z" };

assert.deepEqual(sendAgentControl(identity, "prompt", "status?", run), { ok: true });
assert.deepEqual(calls, [
  ["has-session", "-t", "dev:0.1"],
  ["send-keys", "-t", "dev:0.1", "-l", "status?"],
  ["send-keys", "-t", "dev:0.1", "Enter"],
]);
calls.length = 0;
assert.deepEqual(sendAgentControl(identity, "approve", undefined, run), { ok: true });
assert.deepEqual(calls.slice(1), [
  ["send-keys", "-t", "dev:0.1", "-l", "y"],
  ["send-keys", "-t", "dev:0.1", "Enter"],
]);
assert.equal(sendAgentControl({ tmuxTarget: "bad target" }, "interrupt", undefined, run).ok, false);
assert.equal(sendAgentControl(identity, "prompt", "\u0000", run).ok, false);
assert.equal(sendAgentControl(identity, "prompt", "x".repeat(2001), run).ok, false);
console.log("agent control tests passed: prompt, approve, validation, and rejected input");
