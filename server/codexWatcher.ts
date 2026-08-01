/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { watch } from "chokidar";
import { statSync, readdirSync, readFileSync, existsSync } from "fs";
import { basename, dirname, join } from "path";
import { homedir } from "os";
import { EventEmitter } from "events";
import type { WatchedFile } from "./sourceTypes.js";
import { compactName, readNewLines } from "./utils.js";

const ACTIVE_THRESHOLD_MS = 300_000;
const POLL_INTERVAL_MS = 1000;

interface CodexSessionMeta {
  sessionId: string;
  projectDir: string;
  projectName: string;
  parentSessionId?: string;
  agentType?: string;
}

function buildProjectName(cwd: string | undefined, agentNickname: string | undefined): string {
  if (agentNickname) {
    return compactName(agentNickname);
  }

  if (!cwd) return "Codex";
  if (cwd === homedir()) return "Codex";

  const folderName = basename(cwd);
  return compactName(folderName || "Codex");
}

function readCodexMeta(filePath: string): CodexSessionMeta | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const firstLine = content.split("\n").find((line) => line.trim().length > 0);
    if (!firstLine) return null;

    const record = JSON.parse(firstLine) as Record<string, unknown>;
    if (record.type !== "session_meta") return null;

    const payload = (record.payload ?? {}) as Record<string, unknown>;
    const source = (payload.source ?? {}) as Record<string, unknown>;
    const subagent = (source.subagent ?? {}) as Record<string, unknown>;
    const threadSpawn = (subagent.thread_spawn ?? {}) as Record<string, unknown>;

    const sessionId = typeof payload.id === "string" ? payload.id : basename(filePath, ".jsonl");
    const cwd = typeof payload.cwd === "string" ? payload.cwd : dirname(filePath);
    const parentSessionId = typeof threadSpawn.parent_thread_id === "string" ? threadSpawn.parent_thread_id : undefined;
    const agentNickname =
      typeof payload.agent_nickname === "string"
        ? payload.agent_nickname
        : typeof threadSpawn.agent_nickname === "string"
          ? threadSpawn.agent_nickname
          : undefined;
    const rawAgentType =
      typeof threadSpawn.agent_role === "string"
        ? threadSpawn.agent_role
        : typeof payload.agent_role === "string"
          ? payload.agent_role
          : undefined;
    const agentType = rawAgentType && rawAgentType !== "default" ? rawAgentType : undefined;

    return {
      sessionId,
      projectDir: cwd,
      projectName: buildProjectName(cwd, agentNickname),
      parentSessionId,
      agentType,
    };
  } catch {
    return null;
  }
}

function scanJsonlFiles(root: string): string[] {
  const found: string[] = [];

  function visit(dirPath: string): void {
    let entries;
    try {
      entries = readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        found.push(entryPath);
      }
    }
  }

  visit(root);
  return found;
}

export class CodexJsonlWatcher extends EventEmitter {
  private readonly sessionRoot: string;
  private readonly archiveRoot: string;
  private files = new Map<string, WatchedFile>();
  private sessionIds = new Map<string, string>();
  private watcher: ReturnType<typeof watch> | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(sessionRoot = join(homedir(), ".codex", "sessions"), archiveRoot = join(homedir(), ".codex", "archived_sessions")) {
    super();
    this.sessionRoot = sessionRoot;
    this.archiveRoot = archiveRoot;
  }

  start(): void {
    this.scanForActiveFiles();

    const roots = [this.sessionRoot, this.archiveRoot].filter((root) => existsSync(root));
    if (roots.length > 0) this.watcher = watch(roots, {
      ignoreInitial: true,
      depth: 6,
    });

    this.watcher?.on("add", (filePath: string) => {
      if (filePath.endsWith(".jsonl")) {
        this.addFile(filePath);
      }
    });

    this.watcher?.on("change", (filePath: string) => {
      if (filePath.endsWith(".jsonl") && !this.files.has(filePath)) {
        this.addFile(filePath);
      }
    });

    this.pollInterval = setInterval(() => this.pollFiles(), POLL_INTERVAL_MS);
  }

  stop(): void {
    this.watcher?.close();
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  private scanForActiveFiles(): void {
    const pending: WatchedFile[] = [];
    for (const root of [this.sessionRoot, this.archiveRoot]) {
      for (const filePath of scanJsonlFiles(root)) {
        try {
          const stat = statSync(filePath);
          if (Date.now() - stat.mtimeMs >= ACTIVE_THRESHOLD_MS) continue;
          const watchedFile = this.buildWatchedFile(filePath);
          if (watchedFile) pending.push(watchedFile);
        } catch {
          // ignore unreadable files
        }
      }
    }

    pending
      .sort((left, right) => {
        const leftIsParent = left.parentSessionId ? 1 : 0;
        const rightIsParent = right.parentSessionId ? 1 : 0;
        return leftIsParent - rightIsParent || left.path.localeCompare(right.path);
      })
      .forEach((file) => this.registerFile(file));
  }

  private buildWatchedFile(filePath: string): WatchedFile | null {
    const meta = readCodexMeta(filePath);
    if (!meta) return null;

    return {
      provider: "codex",
      path: filePath,
      sessionId: meta.sessionId,
      projectDir: meta.projectDir,
      projectName: meta.projectName,
      offset: 0,
      lineBuffer: "",
      parentSessionId: meta.parentSessionId,
      agentType: meta.agentType,
    };
  }

  private addFile(filePath: string): void {
    if (this.files.has(filePath)) return;
    const watchedFile = this.buildWatchedFile(filePath);
    if (!watchedFile) return;
    this.registerFile(watchedFile);
  }

  private registerFile(file: WatchedFile): void {
    if (this.files.has(file.path)) return;
    const existingPath = this.sessionIds.get(file.sessionId);
    if (existingPath) {
      const existingFile = this.files.get(existingPath);
      if (existingFile && existingFile.path === file.path) return;
      if (existingFile) {
        return;
      }
    }

    this.files.set(file.path, file);
    this.sessionIds.set(file.sessionId, file.path);
    this.emit("fileAdded", file);
    this.readFileLines(file);
  }

  private pollFiles(): void {
    for (const [path, file] of this.files) {
      try {
        const stat = statSync(path);
        if (stat.size > file.offset) {
          this.readFileLines(file);
        }
        if (Date.now() - stat.mtimeMs > ACTIVE_THRESHOLD_MS) {
          this.files.delete(path);
          if (this.sessionIds.get(file.sessionId) === path) {
            this.sessionIds.delete(file.sessionId);
          }
          this.emit("fileRemoved", file);
        }
      } catch {
        this.files.delete(path);
        if (this.sessionIds.get(file.sessionId) === path) {
          this.sessionIds.delete(file.sessionId);
        }
        this.emit("fileRemoved", file);
      }
    }
  }

  private readFileLines(file: WatchedFile): void {
    readNewLines(file, this);
  }
}
