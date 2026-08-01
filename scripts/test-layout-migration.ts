import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalHome = process.env.HOME;
const tempHome = mkdtempSync(join(tmpdir(), "office-layout-migration-"));
process.env.HOME = tempHome;

try {
  const { loadLayoutWithRevision, restoreLatestLayoutBackup } = await import("../server/layoutManager.js");
  const persistDir = join(tempHome, ".pixel-agents");
  const layoutPath = join(persistDir, "layout.json");
  mkdirSync(persistDir, { recursive: true });

  const userLayout = {
    version: 1,
    layoutRevision: 1,
    cols: 2,
    rows: 2,
    tiles: [{ type: "floor" }],
    furniture: [{ type: "desk", uid: "user-desk" }],
  };
  const bundledLayout = {
    ...userLayout,
    layoutRevision: 2,
    furniture: [{ type: "desk", uid: "bundled-desk" }],
  };
  writeFileSync(layoutPath, JSON.stringify(userLayout), "utf-8");

  const result = loadLayoutWithRevision(bundledLayout);
  assert.ok(result);
  assert.equal(result.wasReset, true);
  assert.match(result.backupFileName ?? "", /^layout\.json\.backup-.+\.json$/);
  assert.deepEqual(JSON.parse(readFileSync(layoutPath, "utf-8")), bundledLayout);

  const backupPath = join(persistDir, result.backupFileName!);
  assert.equal(existsSync(backupPath), true);
  assert.deepEqual(JSON.parse(readFileSync(backupPath, "utf-8")), userLayout);

  const restored = restoreLatestLayoutBackup();
  assert.ok(restored);
  assert.equal(restored.backupFileName, result.backupFileName);
  assert.deepEqual(restored.layout, userLayout);
  console.log("layout migration tests passed: backup created and latest user layout restored");
} finally {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  rmSync(tempHome, { recursive: true, force: true });
}
