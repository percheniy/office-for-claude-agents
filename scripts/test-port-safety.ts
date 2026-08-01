import assert from "node:assert/strict";
import { createServer, type Server } from "node:net";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function runCli(home: string, args: string[]) {
  return spawnSync(process.execPath, [join(process.cwd(), "bin", "cli.js"), ...args], {
    env: { ...process.env, HOME: home },
    encoding: "utf-8",
  });
}

async function listen(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
}

const tempHome = mkdtempSync(join(tmpdir(), "office-port-safety-"));
const persistDir = join(tempHome, ".pixel-agents");
mkdirSync(persistDir, { recursive: true });
const port = 19879;

try {
  writeFileSync(join(persistDir, ".server.pid"), JSON.stringify({
    pid: process.pid,
    port,
    bindHost: "127.0.0.1",
    owner: "office-for-claude-agents",
  }));
  const stalePid = runCli(tempHome, ["status", "--port", String(port)]);
  assert.equal(stalePid.status, 0);
  assert.match(stalePid.stdout, /Server not running/);

  const foreignServer = createServer();
  await listen(foreignServer, port);
  const conflict = runCli(tempHome, ["start", "--port", String(port), "--no-open"]);
  assert.notEqual(conflict.status, 0);
  assert.match(`${conflict.stdout}${conflict.stderr}`, /port 19879 is already in use/i);
  assert.ok(foreignServer.listening, "foreign process must remain alive after conflict");
  await new Promise<void>((resolve) => foreignServer.close(() => resolve()));
  console.log("port safety tests passed: stale PID rejected and foreign listener preserved");
} finally {
  rmSync(tempHome, { recursive: true, force: true });
}
