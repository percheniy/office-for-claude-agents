/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

/**
 * Config Persistence — Read/write ~/.pixel-agents/config.json
 *
 * Stores user preferences that should persist across server restarts:
 * - soundEnabled: boolean (notification sound toggle)
 * - externalAssetDirectories: string[] (additional furniture asset paths)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import type { SessionSourcesConfig } from "./sessionPaths.js";

const CONFIG_DIR = join(homedir(), ".pixel-agents");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface DaemonConfig {
  url: string;       // e.g., "ws://192.168.1.50:9876"
  name: string;      // e.g., "Server 1"
  enabled: boolean;
}

export interface PixelAgentsConfig {
  soundEnabled: boolean;
  desktopNotifications: boolean;
  externalAssetDirectories: string[];
  githubTasks: GithubTasksConfig;
  daemons: DaemonConfig[];
  shareProxyUrl: string;  // e.g., "https://gridchins.ru/office" — public URL for share links
  sessionSources: SessionSourcesConfig;
  characterPackDirectory: string;
  enabledCharacterIndexes: number[];
}

export interface GithubTaskStateConfig {
  id: string;
  label: string;
  color: string;
  labels: string[];
}

export interface GithubTaskGateConfig {
  gate: number;
  label: string;
}

export interface GithubTasksConfig {
  enabled: boolean;
  maxIssues: number;
  pipeline: {
    enabled: boolean;
    states: GithubTaskStateConfig[];
    gates: GithubTaskGateConfig[];
  };
}

const DEFAULT_CONFIG: PixelAgentsConfig = {
  soundEnabled: true,
  desktopNotifications: false,
  externalAssetDirectories: [],
  daemons: [],
  shareProxyUrl: "",
  githubTasks: {
    enabled: true,
    maxIssues: 30,
    pipeline: {
      enabled: false,
      states: [
        { id: "todo", label: "To Do", color: "#fc0", labels: ["todo", "backlog"] },
        { id: "in_progress", label: "In Progress", color: "#3794ff", labels: ["in-progress", "wip"] },
        { id: "review_ready", label: "Review", color: "#a78bfa", labels: ["review-ready"] },
        { id: "done", label: "Done", color: "#5ac88c", labels: ["done", "completed"] },
        { id: "blocked", label: "Blocked", color: "#e55", labels: ["blocked"] },
      ],
      gates: [],
    },
  },
  sessionSources: {},
  characterPackDirectory: join(CONFIG_DIR, "characters"),
  enabledCharacterIndexes: [0, 1, 2, 3, 4, 5],
};

function normalizeGithubTasksConfig(config: Partial<GithubTasksConfig> | undefined): GithubTasksConfig {
  const pipeline = config?.pipeline;
  return {
    enabled: typeof config?.enabled === "boolean" ? config.enabled : DEFAULT_CONFIG.githubTasks.enabled,
    maxIssues: typeof config?.maxIssues === "number" && config.maxIssues > 0
      ? Math.min(Math.max(Math.floor(config.maxIssues), 1), 100)
      : DEFAULT_CONFIG.githubTasks.maxIssues,
    pipeline: {
      enabled: typeof pipeline?.enabled === "boolean"
        ? pipeline.enabled
        : DEFAULT_CONFIG.githubTasks.pipeline.enabled,
      states: Array.isArray(pipeline?.states)
        ? pipeline.states
            .filter((state): state is GithubTaskStateConfig => {
              return !!state
                && typeof state.id === "string"
                && typeof state.label === "string"
                && typeof state.color === "string"
                && Array.isArray(state.labels);
            })
            .map((state) => ({
              id: state.id,
              label: state.label,
              color: state.color,
              labels: state.labels.filter((label): label is string => typeof label === "string"),
            }))
        : DEFAULT_CONFIG.githubTasks.pipeline.states.map((state) => ({ ...state, labels: [...state.labels] })),
      gates: Array.isArray(pipeline?.gates)
        ? pipeline.gates
            .filter((gate): gate is GithubTaskGateConfig => {
              return !!gate
                && typeof gate.gate === "number"
                && Number.isFinite(gate.gate)
                && typeof gate.label === "string";
            })
            .map((gate) => ({ gate: Math.floor(gate.gate), label: gate.label }))
        : DEFAULT_CONFIG.githubTasks.pipeline.gates.map((gate) => ({ ...gate })),
    },
  };
}

let cachedConfig: PixelAgentsConfig | null = null;

export function loadConfig(): PixelAgentsConfig {
  try {
    if (!existsSync(CONFIG_FILE)) {
      cachedConfig = { ...DEFAULT_CONFIG };
      return cachedConfig;
    }
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PixelAgentsConfig>;
    cachedConfig = {
      soundEnabled: typeof parsed.soundEnabled === "boolean" ? parsed.soundEnabled : DEFAULT_CONFIG.soundEnabled,
      desktopNotifications: typeof parsed.desktopNotifications === "boolean" ? parsed.desktopNotifications : DEFAULT_CONFIG.desktopNotifications,
      externalAssetDirectories: Array.isArray(parsed.externalAssetDirectories)
        ? parsed.externalAssetDirectories.filter((d): d is string => typeof d === "string")
        : [],
      daemons: Array.isArray((parsed as any).daemons) ? (parsed as any).daemons : [],
      shareProxyUrl: typeof (parsed as any).shareProxyUrl === "string" ? (parsed as any).shareProxyUrl : "",
      sessionSources: normalizeSessionSources((parsed as Partial<PixelAgentsConfig>).sessionSources),
      githubTasks: normalizeGithubTasksConfig(parsed.githubTasks),
      characterPackDirectory: typeof parsed.characterPackDirectory === "string" && parsed.characterPackDirectory.trim()
        ? parsed.characterPackDirectory.trim()
        : DEFAULT_CONFIG.characterPackDirectory,
      enabledCharacterIndexes: normalizeCharacterIndexes(parsed.enabledCharacterIndexes),
    };
    return cachedConfig;
  } catch (err) {
    console.error("[ConfigPersistence] Failed to read config:", err);
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }
}

function normalizeCharacterIndexes(value: unknown): number[] {
  if (!Array.isArray(value)) return [...DEFAULT_CONFIG.enabledCharacterIndexes];
  const indexes = [...new Set(value.filter((item): item is number => Number.isInteger(item) && item >= 0 && item < 6))];
  return indexes.length > 0 ? indexes.sort((a, b) => a - b) : [...DEFAULT_CONFIG.enabledCharacterIndexes];
}

function normalizeSessionSources(value: unknown): SessionSourcesConfig {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  return {
    claudeProjectsDir: typeof raw.claudeProjectsDir === "string" ? raw.claudeProjectsDir : undefined,
    codexSessionsDir: typeof raw.codexSessionsDir === "string" ? raw.codexSessionsDir : undefined,
    codexArchivedSessionsDir: typeof raw.codexArchivedSessionsDir === "string" ? raw.codexArchivedSessionsDir : undefined,
  };
}

export function saveConfig(config: PixelAgentsConfig): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    const json = JSON.stringify(config, null, 2);
    const tmpPath = CONFIG_FILE + ".tmp";
    writeFileSync(tmpPath, json, "utf-8");
    renameSync(tmpPath, CONFIG_FILE);
    cachedConfig = { ...config };
  } catch (err) {
    console.error("[ConfigPersistence] Failed to write config:", err);
  }
}

export function getConfig(): PixelAgentsConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}
