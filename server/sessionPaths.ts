/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { existsSync, statSync } from "fs";
import { homedir } from "os";
import { isAbsolute, resolve } from "path";

export interface SessionSourcesConfig {
  claudeProjectsDir?: string;
  codexSessionsDir?: string;
  codexArchivedSessionsDir?: string;
}

export interface ResolvedSessionPaths {
  claudeProjectsDir: string;
  codexSessionsDir: string;
  codexArchivedSessionsDir: string;
}

function normalizePath(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\u0000")) return fallback;
  const trimmed = value.trim();
  const expanded = trimmed === "~" ? homedir() : trimmed.startsWith("~/") ? resolve(homedir(), trimmed.slice(2)) : trimmed;
  const normalized = isAbsolute(expanded) ? resolve(expanded) : resolve(process.cwd(), expanded);
  try {
    if (existsSync(normalized) && !statSync(normalized).isDirectory()) return fallback;
  } catch {
    return fallback;
  }
  return normalized;
}

export function resolveSessionPaths(env: NodeJS.ProcessEnv = process.env, config: SessionSourcesConfig = {}): ResolvedSessionPaths {
  const defaults = {
    claudeProjectsDir: resolve(homedir(), ".claude", "projects"),
    codexSessionsDir: resolve(homedir(), ".codex", "sessions"),
    codexArchivedSessionsDir: resolve(homedir(), ".codex", "archived_sessions"),
  };
  return {
    claudeProjectsDir: normalizePath(env.PIXEL_AGENTS_CLAUDE_PROJECTS_DIR ?? config.claudeProjectsDir, defaults.claudeProjectsDir),
    codexSessionsDir: normalizePath(env.PIXEL_AGENTS_CODEX_SESSIONS_DIR ?? config.codexSessionsDir, defaults.codexSessionsDir),
    codexArchivedSessionsDir: normalizePath(env.PIXEL_AGENTS_CODEX_ARCHIVED_SESSIONS_DIR ?? config.codexArchivedSessionsDir, defaults.codexArchivedSessionsDir),
  };
}
