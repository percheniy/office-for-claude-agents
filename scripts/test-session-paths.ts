import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { resolveSessionPaths } from "../server/sessionPaths.js";

const root = mkdtempSync(join(process.env.TMPDIR || "/tmp", "pixel-agent-paths-"));
const envClaude = join(root, "env-claude");
const configCodex = join(root, "config-codex");
const invalidFile = join(root, "not-a-directory");
writeFileSync(invalidFile, "x");

const resolved = resolveSessionPaths({ PIXEL_AGENTS_CLAUDE_PROJECTS_DIR: envClaude }, {
  claudeProjectsDir: join(root, "config-claude"),
  codexSessionsDir: configCodex,
  codexArchivedSessionsDir: invalidFile,
});
assert.equal(resolved.claudeProjectsDir, resolve(envClaude));
assert.equal(resolved.codexSessionsDir, resolve(configCodex));
assert.equal(resolved.codexArchivedSessionsDir, resolve(homedir(), ".codex", "archived_sessions"));

const fallback = resolveSessionPaths({ PIXEL_AGENTS_CODEX_SESSIONS_DIR: "\u0000bad" }, {});
assert.equal(fallback.codexSessionsDir, resolve(homedir(), ".codex", "sessions"));
console.log("session path tests passed: env precedence, config normalization, invalid and missing paths");
