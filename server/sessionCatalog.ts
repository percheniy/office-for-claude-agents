/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { spawn } from "child_process";
import { existsSync, readdirSync, statSync, openSync, readSync, closeSync } from "fs";
import { basename, join } from "path";
import { compactName } from "./utils.js";
import type { AgentProvider } from "./sourceTypes.js";
import type { ResolvedSessionPaths } from "./sessionPaths.js";
import { inspectAgentSession } from "./sessionIdentity.js";

const ACTIVE_THRESHOLD_MS = 1_800_000;
const MAX_EDGE_BYTES = 48 * 1024;
const MAX_FILES_PER_ROOT = 2000;

export type SessionHistoryState = "active" | "detached" | "completed" | "stale";

export interface SessionHistoryItem {
  provider: AgentProvider;
  sessionId: string;
  projectDir: string;
  projectName: string;
  title?: string;
  lastActivity: string;
  sizeBytes: number;
  state: SessionHistoryState;
  resumable: boolean;
  readOnlyReason?: string;
}

function readEdges(path: string): { first: string; last: string } | null {
  try {
    const stat = statSync(path);
    const fd = openSync(path, "r");
    const firstLength = Math.min(MAX_EDGE_BYTES, stat.size);
    const firstBuffer = Buffer.alloc(firstLength);
    readSync(fd, firstBuffer, 0, firstLength, 0);
    const lastLength = Math.min(MAX_EDGE_BYTES, stat.size);
    const lastBuffer = Buffer.alloc(lastLength);
    readSync(fd, lastBuffer, 0, lastLength, Math.max(0, stat.size - lastLength));
    closeSync(fd);
    return { first: firstBuffer.toString("utf-8"), last: lastBuffer.toString("utf-8") };
  } catch {
    return null;
  }
}

function parseLines(text: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as unknown;
      if (value && typeof value === "object") records.push(value as Record<string, unknown>);
    } catch { /* bounded edges can start/end in a partial line */ }
  }
  return records;
}

function textFromMessage(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (!Array.isArray(value)) return undefined;
  const text = value.find((block) => block && typeof block === "object" && (block as Record<string, unknown>).type === "text") as Record<string, unknown> | undefined;
  return typeof text?.text === "string" ? text.text.trim() || undefined : undefined;
}

function inspectFile(path: string, provider: AgentProvider, defaultProjectDir: string, identityBudget: { remaining: number }): SessionHistoryItem | null {
  let stat;
  try { stat = statSync(path); } catch { return null; }
  if (!stat.isFile() || !path.endsWith(".jsonl")) return null;
  const edges = readEdges(path);
  if (!edges) return null;
  const firstRecords = parseLines(edges.first);
  const lastRecords = parseLines(edges.last);
  const first = firstRecords[0] || {};
  const payload = (first.payload && typeof first.payload === "object" ? first.payload : {}) as Record<string, unknown>;
  const sessionId = provider === "codex" && typeof payload.id === "string"
    ? payload.id
    : typeof first.sessionId === "string" ? first.sessionId : basename(path, ".jsonl");
  if (!sessionId) return null;
  const projectDir = typeof payload.cwd === "string" ? payload.cwd : typeof first.cwd === "string" ? first.cwd : defaultProjectDir;
  const firstUser = [...firstRecords, ...lastRecords].find((record) => record.type === "user");
  const message = firstUser ? (firstUser.message as Record<string, unknown> | undefined) : undefined;
  const title = textFromMessage(message?.content) || (typeof first.title === "string" ? first.title.trim() : undefined);
  const last = lastRecords.at(-1) || {};
  const lastType = typeof last.type === "string" ? last.type : typeof last.event === "string" ? last.event : "";
  const age = Date.now() - stat.mtimeMs;
  let identity: ReturnType<typeof inspectAgentSession> | null = null;
  if (age <= ACTIVE_THRESHOLD_MS && identityBudget.remaining > 0) {
    identityBudget.remaining -= 1;
    identity = inspectAgentSession({ provider, sessionId, projectDir, transcriptPath: path });
  }
  const state: SessionHistoryState = age <= ACTIVE_THRESHOLD_MS
    ? identity?.state === "detached" ? "detached" : "active"
    : /result|session_end|completed|closed/i.test(lastType) ? "completed" : "stale";
  const resumable = provider === "claude" || provider === "codex";
  return {
    provider,
    sessionId,
    projectDir,
    projectName: compactName(basename(projectDir) || provider),
    title: title ? title.slice(0, 160) : undefined,
    lastActivity: new Date(stat.mtimeMs).toISOString(),
    sizeBytes: stat.size,
    state,
    resumable,
    readOnlyReason: resumable ? undefined : "This provider exposes local history but no resume command yet.",
  };
}

function scan(root: string, maxDepth = 6): string[] {
  const found: string[] = [];
  const visit = (dir: string, depth: number): void => {
    if (found.length >= MAX_FILES_PER_ROOT || depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path, depth + 1);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) found.push(path);
      if (found.length >= MAX_FILES_PER_ROOT) return;
    }
  };
  if (existsSync(root)) visit(root, 0);
  return found;
}

export function listSessionHistory(paths: ResolvedSessionPaths, extraRoots: string[] = []): SessionHistoryItem[] {
  const candidates: Array<{ provider: AgentProvider; root: string }> = [
    { provider: "claude", root: paths.claudeProjectsDir },
    { provider: "codex", root: paths.codexSessionsDir },
    { provider: "codex", root: paths.codexArchivedSessionsDir },
    ...extraRoots.map((root) => ({ provider: "generic" as AgentProvider, root })),
  ];
  const unique = new Map<string, SessionHistoryItem>();
  // Process inspection runs `ps`/`tmux`; cap it so a large history cannot turn
  // a read-only picker refresh into thousands of subprocesses.
  const identityBudget = { remaining: 100 };
  for (const candidate of candidates) {
    for (const path of scan(candidate.root)) {
      const item = inspectFile(path, candidate.provider, candidate.root, identityBudget);
      if (!item) continue;
      const key = `${item.provider}:${item.sessionId}`;
      const previous = unique.get(key);
      if (!previous || item.lastActivity > previous.lastActivity) unique.set(key, item);
    }
  }
  return [...unique.values()].sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

export function resumeSession(item: SessionHistoryItem): { ok: boolean; reason?: string } {
  if (!item.resumable) return { ok: false, reason: item.readOnlyReason || "Provider is read-only." };
  if (item.state === "active") return { ok: false, reason: "Session is already active." };
  const command = item.provider === "claude" ? "claude" : "codex";
  const args = item.provider === "claude" ? ["--resume", item.sessionId] : ["resume", item.sessionId];
  try {
    spawn(command, args, { cwd: item.projectDir, detached: true, stdio: "ignore" }).unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Provider CLI could not be started." };
  }
}
