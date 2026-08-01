/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { watch } from "chokidar";
import { existsSync, readdirSync, statSync, readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { EventEmitter } from "events";
import { homedir } from "os";
import type { AgentProvider, AgentSource, WatchedFile } from "./sourceTypes.js";
import { compactName, readNewLines } from "./utils.js";

const ACTIVE_THRESHOLD_MS = 1_800_000;
const POLL_INTERVAL_MS = 3000;
const RESCAN_INTERVAL_MS = 15_000;

export interface GenericSourceOptions {
  provider: AgentProvider;
  displayName: string;
  roots: string[];
  fileNames?: string[];
}

function configuredRoot(envName: string): string | undefined {
  const value = process.env[envName]?.trim();
  return value || undefined;
}

export function defaultOpenCodeRoots(): string[] {
  const xdg = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return [
    configuredRoot("PIXEL_AGENTS_OPENCODE_SESSION_DIR"),
    join(xdg, "opencode", "sessions"),
    join(xdg, "opencode", "storage"),
    join(homedir(), "Library", "Application Support", "opencode", "sessions"),
  ].filter((root): root is string => !!root);
}

export function defaultCopilotRoots(): string[] {
  return [
    configuredRoot("PIXEL_AGENTS_COPILOT_SESSION_DIR"),
    join(homedir(), ".copilot", "session-state"),
  ].filter((root): root is string => !!root);
}

export function defaultGenericEventRoots(): string[] {
  return [configuredRoot("PIXEL_AGENTS_EVENTS_DIR")].filter((root): root is string => !!root);
}

export class GenericJsonlSource extends EventEmitter implements AgentSource {
  readonly provider: AgentProvider;
  readonly displayName: string;
  private readonly roots: string[];
  private readonly fileNames: Set<string> | null;
  private files = new Map<string, WatchedFile>();
  private watcher: ReturnType<typeof watch> | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private rescanInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: GenericSourceOptions) {
    super();
    this.provider = options.provider;
    this.displayName = options.displayName;
    this.roots = [...new Set(options.roots)];
    this.fileNames = options.fileNames ? new Set(options.fileNames) : null;
  }

  start(): void {
    this.scanForFiles();
    const existingRoots = this.roots.filter((root) => existsSync(root));
    if (existingRoots.length > 0) {
      this.watcher = watch(existingRoots, { ignoreInitial: true, depth: 8, awaitWriteFinish: false });
      this.watcher.on("add", (filePath: string) => this.acceptPath(filePath));
      this.watcher.on("change", (filePath: string) => {
        if (!this.files.has(filePath)) this.addFile(filePath);
      });
    }
    this.pollInterval = setInterval(() => this.pollFiles(), POLL_INTERVAL_MS);
    this.rescanInterval = setInterval(() => this.scanForFiles(), RESCAN_INTERVAL_MS);
  }

  stop(): void {
    this.watcher?.close();
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.rescanInterval) clearInterval(this.rescanInterval);
    this.watcher = null;
    this.pollInterval = null;
    this.rescanInterval = null;
  }

  getActiveFiles(): WatchedFile[] {
    return [...this.files.values()];
  }

  private acceptPath(filePath: string): void {
    if (!filePath.endsWith(".jsonl")) return;
    if (this.fileNames && !this.fileNames.has(basename(filePath))) return;
    this.addFile(filePath);
  }

  private scanForFiles(): void {
    for (const root of this.roots) {
      this.scanDirectory(root);
    }
  }

  private scanDirectory(root: string): void {
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        this.scanDirectory(path);
      } else {
        this.acceptPath(path);
      }
    }
  }

  private addFile(filePath: string): void {
    if (this.files.has(filePath)) return;
    let stat;
    try {
      stat = statSync(filePath);
      if (!stat.isFile() || Date.now() - stat.mtimeMs > ACTIVE_THRESHOLD_MS) return;
    } catch {
      return;
    }

    const firstLine = (() => {
      try { return readFileSync(filePath, "utf-8").split("\n").find((line) => line.trim()) ?? ""; } catch { return ""; }
    })();
    let metadata: Record<string, unknown> = {};
    try { metadata = JSON.parse(firstLine) as Record<string, unknown>; } catch { /* partial line */ }
    const provider = typeof metadata.provider === "string" && this.provider === "generic"
      ? metadata.provider as AgentProvider
      : this.provider;
    const sessionId = typeof metadata.sessionId === "string"
      ? metadata.sessionId
      : typeof metadata.session_id === "string" ? metadata.session_id : basename(filePath, ".jsonl");
    const projectDir = typeof metadata.projectDir === "string"
      ? metadata.projectDir
      : typeof metadata.cwd === "string" ? metadata.cwd : dirname(filePath);
    const projectName = typeof metadata.projectName === "string"
      ? compactName(metadata.projectName)
      : compactName(basename(projectDir) || provider);
    const file: WatchedFile = {
      provider,
      path: filePath,
      sessionId,
      projectDir,
      projectName,
      offset: 0,
      lineBuffer: "",
      parentSessionId: typeof metadata.parentSessionId === "string" ? metadata.parentSessionId : undefined,
      model: typeof metadata.model === "string" ? metadata.model : undefined,
    };
    this.files.set(filePath, file);
    this.emit("fileAdded", file);
    readNewLines(file, this);
  }

  private pollFiles(): void {
    for (const [path, file] of this.files) {
      try {
        const stat = statSync(path);
        if (stat.size > file.offset) readNewLines(file, this);
        if (Date.now() - stat.mtimeMs > ACTIVE_THRESHOLD_MS) {
          this.files.delete(path);
          this.emit("fileRemoved", file);
        }
      } catch {
        this.files.delete(path);
        this.emit("fileRemoved", file);
      }
    }
  }
}

export class OpenCodeSource extends GenericJsonlSource {
  constructor() {
    super({ provider: "opencode", displayName: "OpenCode", roots: defaultOpenCodeRoots() });
  }
}

export class CopilotSource extends GenericJsonlSource {
  constructor() {
    super({ provider: "copilot", displayName: "GitHub Copilot", roots: defaultCopilotRoots(), fileNames: ["events.jsonl"] });
  }
}

export class GenericHookSource extends GenericJsonlSource {
  constructor() {
    super({ provider: "generic", displayName: "Local agent events", roots: defaultGenericEventRoots() });
  }
}
