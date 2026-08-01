import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectAgentSession, parseTmuxPanes } from "../server/sessionIdentity.js";

const root = mkdtempSync(join(tmpdir(), "pixel-agent-session-"));
const transcriptPath = join(root, "session.jsonl");
writeFileSync(transcriptPath, "{}\n");
const now = Date.now();

assert.deepEqual(parseTmuxPanes("dev\t0\t1\t4321\tclaude\t0\t/Users/grid/project\n"), [{
  sessionName: "dev", windowIndex: "0", paneIndex: "1", panePid: 4321,
  command: "claude", attached: false, cwd: "/Users/grid/project",
}]);

const detached = inspectAgentSession({
  provider: "claude", sessionId: "session-1", projectDir: "/Users/grid/project", transcriptPath,
}, {
  now,
  host: "remote-host",
  run: (command, args) => {
    if (command === "tmux") return "dev\t0\t1\t4321\tclaude\t0\t/Users/grid/project\n";
    if (args[0] === "-axo") return "4321 10 claude --session-id session-1\n";
    return "10 claude --session-id session-1\n";
  },
});
assert.equal(detached.state, "detached");
assert.equal(detached.tmuxTarget, "dev:0.1");
assert.equal(detached.pid, 4321);
assert.equal(detached.host, "remote-host");

const stale = inspectAgentSession({
  provider: "claude", sessionId: "session-1", projectDir: "/Users/grid/project", transcriptPath,
}, { now: now + 1_800_001, run: (command, args) => args[0] === "-axo" ? "4321 10 claude --session-id session-1\n" : "10 claude --session-id session-1\n" });
assert.equal(stale.state, "stale");

const dead = inspectAgentSession({
  provider: "claude", sessionId: "session-2", projectDir: "/Users/grid/project", transcriptPath,
}, { now: now + 1_800_001, run: () => null });
assert.equal(dead.state, "dead");

console.log("session identity tests passed: tmux target, detached, stale, and dead-process safety");
