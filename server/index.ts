import express from "express";
import { createServer } from "http";
import type { IncomingMessage } from "http";
import { WebSocketServer } from "ws";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { spawn, type ChildProcess } from "child_process";
import crypto from "crypto";

import { JsonlWatcher } from "./watcher.js";
import { CodexJsonlWatcher } from "./codexWatcher.js";
import {
  loadCharacterSprites,
  loadWallTiles,
  loadFloorTiles,
  loadDefaultLayout,
} from "./assetLoader.js";
import type { LoadedFurnitureAssets } from "./assetLoader.js";
import { loadConfig, getConfig, saveConfig } from "./configPersistence.js";
import { openPath, findPidsOnPort } from "./platform.js";
import { DaemonHub } from "./daemonHub.js";
import { isShareTokenValid } from "./shareManager.js";
import { stopShareCleanup } from "./shareManager.js";
import { authorizeWebSocketRequest, getServerSecurityConfig } from "./security.js";
import {
  loadAllFurniture,
  loadLayoutWithRevision,
  writeLayoutToFile,
  loadPersistedSeats,
  loadRoleOverrides,
  LayoutWatcher,
  persistDir,
} from "./layoutManager.js";
import {
  saveAgentState,
  loadAgentState,
  startSubagentAutoSuspend,
} from "./agentPersistence.js";
import {
  agents,
  nextAgentId,
  setNextAgentId,
  recentSendMessages,
  init as initAgentManager,
  handleFileAdded,
  handleFileRemoved,
  handleWatchedLine,
} from "./agentManager.js";
import { resolveTeamParent } from "./agentManager.js";
import { startPolling as startGithubPolling, stopPolling as stopGithubPolling } from "./githubPoller.js";
import {
  broadcast,
  clients,
  startHeartbeat,
  initWsHandler,
  setupConnectionHandler,
} from "./wsHandler.js";

// ── Paths & constants ───────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "9876", 10);
const security = getServerSecurityConfig();
const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
const CODEX_SESSIONS_DIR = join(homedir(), ".codex", "sessions");

// ── Assets ──────────────────────────────────────────────────────────────

const devAssetsRoot = join(__dirname, "..", "webview-ui", "public", "assets");
const prodAssetsRoot = join(__dirname, "public", "assets");
const isDev = !__dirname.endsWith("/dist") && !__dirname.endsWith("\\dist");
const assetsRoot = isDev ? devAssetsRoot : prodAssetsRoot;

console.log(`[Server] Loading assets from: ${assetsRoot}`);

const characterSprites = loadCharacterSprites(assetsRoot);
const wallTiles = loadWallTiles(assetsRoot);
const floorTiles = loadFloorTiles(assetsRoot);

// ── Config ──────────────────────────────────────────────────────────────

const config = loadConfig();
console.log(`[Server] Config loaded: soundEnabled=${config.soundEnabled}, externalDirs=${config.externalAssetDirectories.length}`);

// ── Furniture & Layout ──────────────────────────────────────────────────

let furnitureAssets = loadAllFurniture(assetsRoot);
const defaultLayout = loadDefaultLayout(assetsRoot);

const layoutResult = loadLayoutWithRevision(defaultLayout);
const currentLayout = { value: layoutResult?.layout ?? null };
const layoutWasReset = layoutResult?.wasReset ?? false;
const persistedSeats = loadPersistedSeats();
const roleOverrides = loadRoleOverrides();

// ── Agent state persistence ─────────────────────────────────────────────

const agentStatePath = join(persistDir, "agents-state.json");
const previousAgentState = loadAgentState(agentStatePath);
if (previousAgentState) {
  console.log(`[Server] Found previous agent state with ${previousAgentState.agents.length} agents, nextAgentId=${previousAgentState.nextAgentId}`);
  if (previousAgentState.nextAgentId > nextAgentId) {
    setNextAgentId(previousAgentState.nextAgentId);
  }
}

// ── Watchers ────────────────────────────────────────────────────────────

const claudeWatcher = new JsonlWatcher();
const watchers = [claudeWatcher, new CodexJsonlWatcher()];

// ── Initialize agent manager ────────────────────────────────────────────

let lastActivityTime = Date.now();

initAgentManager({
  broadcast,
  claudeWatcher,
  roleOverrides,
  previousAgentState,
  onActivity: () => { lastActivityTime = Date.now(); },
});

// Wire watcher events
for (const watcher of watchers) {
  watcher.on("fileAdded", handleFileAdded);
  watcher.on("fileRemoved", handleFileRemoved);
  watcher.on("line", handleWatchedLine);
}

// ── Claude process spawning ─────────────────────────────────────────────

const spawnedClaudes = new Set<ChildProcess>();

function launchClaude(bypassPermissions: boolean): void {
  const sessionId = crypto.randomUUID();
  const args = ["--session-id", sessionId];
  if (bypassPermissions) {
    args.push("--dangerously-skip-permissions");
  }
  console.log(`[Server] Launching claude ${args.join(" ")}`);
  const child = spawn("claude", args, {
    detached: true,
    stdio: "ignore",
  });
  spawnedClaudes.add(child);
  child.on("exit", () => {
    spawnedClaudes.delete(child);
  });
  child.unref();
}

function cleanupSpawnedClaudes(): void {
  for (const child of spawnedClaudes) {
    try {
      if (child.pid) {
        process.kill(-child.pid, "SIGTERM");
      }
    } catch { /* already exited */ }
  }
  spawnedClaudes.clear();
}

function openSessionsFolder(): void {
  const dirs = [CLAUDE_PROJECTS_DIR, CODEX_SESSIONS_DIR].filter((dir) => existsSync(dir));
  if (dirs.length === 0) {
    openPath(join(homedir(), ".claude"));
    return;
  }
  for (const dir of dirs) {
    openPath(dir);
  }
}

// ── Test agents ─────────────────────────────────────────────────────────

const testAgentIds = new Set<number>();
const testAgentData = new Map<number, { folderName: string; role: string; parentAgentId?: number; model: string }>();

// ── Express app ─────────────────────────────────────────────────────────

const app = express();

app.get("/share/:token", (req, res) => {
  const { token } = req.params;
  if (!isShareTokenValid(token)) {
    res.status(410).send("Share link expired or invalid");
    return;
  }
  const cfg = getConfig();
  let basePath = "/";
  if (cfg.shareProxyUrl) {
    try {
      const parsed = new URL(cfg.shareProxyUrl);
      basePath = parsed.pathname.replace(/\/?$/, "/");
    } catch { /* use default */ }
  }
  const html = readFileSync(join(__dirname, "public", "index.html"), "utf-8");
  const patched = html.replace("<head>", `<head><base href="${basePath}">`);
  res.type("html").send(patched);
});

app.use(express.static(join(__dirname, "public"), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
  },
}));

// ── HTTP & WebSocket server ─────────────────────────────────────────────

const server = createServer(app);
const wss = new WebSocketServer({
  server,
  verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) => {
    return authorizeWebSocketRequest(info.req, security, isShareTokenValid).authorized;
  },
});

wss.on("error", (err) => {
  console.error(`[Server] WebSocket server error: ${err.message}`);
});

// ── Initialize WS handler ───────────────────────────────────────────────

const heartbeatTimer = startHeartbeat();

initWsHandler({
  characterSprites,
  wallTiles,
  floorTiles,
  furnitureAssets,
  currentLayout,
  layoutWasReset,
  isDev,
  persistedSeats,
  previousAgentState,
  testAgentData,
  getFurnitureAssets: () => furnitureAssets,
  setFurnitureAssets: (a) => { furnitureAssets = a; },
});

// ── Layout watcher ──────────────────────────────────────────────────────

const layoutWatcher = new LayoutWatcher(currentLayout, broadcast);
layoutWatcher.start();

// ── Daemon hub ──────────────────────────────────────────────────────────

const daemonHub = new DaemonHub();
daemonHub.on("message", (msg) => {
  broadcast(msg);
});

{
  const daemonConfig = getConfig();
  if (daemonConfig.daemons && daemonConfig.daemons.length > 0) {
    daemonHub.start(daemonConfig.daemons);
  }
}

// ── Setup WS connection handler ─────────────────────────────────────────

setupConnectionHandler(wss, {
  PORT,
  security,
  assetsRoot,
  currentLayout,
  layoutWatcher,
  launchClaude,
  openSessionsFolder,
  testAgentIds,
  testAgentData,
  getNextAgentId: () => {
    const id = nextAgentId;
    // Advance nextAgentId by the number of test agents that will be created (8)
    setNextAgentId(nextAgentId + 8);
    return id;
  },
  daemonHub,
});

// ── Timers ──────────────────────────────────────────────────────────────

const agentStateSaveTimer = setInterval(() => {
  saveAgentState(agentStatePath, persistDir, agents, nextAgentId, persistedSeats);
}, 30_000);

const subagentSuspendTimer = startSubagentAutoSuspend(
  agents,
  broadcast,
  recentSendMessages,
  (path) => claudeWatcher.suspendFile(path),
);

// ── Start watchers & polling ────────────────────────────────────────────

for (const watcher of watchers) {
  watcher.start();
}

startGithubPolling(agents, broadcast);

// ── Server startup ──────────────────────────────────────────────────────

function startServer(retries = 1): void {
  const pidDir = join(homedir(), ".pixel-agents");
  const pidFile = join(pidDir, ".server.pid");
  try {
    const existingPid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
    if (existingPid && existingPid !== process.pid) {
      try {
        process.kill(existingPid, 0);
        console.log(`[Server] Another instance already running (PID ${existingPid}). Exiting.`);
        process.exit(0);
      } catch {
        try { unlinkSync(pidFile); } catch {}
      }
    }
  } catch {
    // No PID file or unreadable
  }

  server.listen(PORT, security.bindHost, () => {
    console.log(`Pixel Agents server running at http://localhost:${PORT} (bound to ${security.bindHost})`);
    console.log(`Watching ~/.claude/projects and ~/.codex/sessions for active sessions...`);

    try {
      mkdirSync(pidDir, { recursive: true });
      writeFileSync(pidFile, String(process.pid));
    } catch {}

    setTimeout(() => {
      for (const [, agent] of agents) {
        resolveTeamParent(agent);
      }
      saveAgentState(agentStatePath, persistDir, agents, nextAgentId, persistedSeats);
    }, 2000);
  });

  server.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && retries > 0) {
      console.log(`[Server] Port ${PORT} in use, killing existing process and retrying...`);
      setTimeout(() => {
        const pids = findPidsOnPort(PORT);
        for (const pid of pids) {
          if (pid === process.pid) continue;
          try { process.kill(pid, "SIGTERM"); } catch {}
        }
        setTimeout(() => startServer(retries - 1), 1500);
      }, 500);
    } else {
      console.error(`[Server] Fatal error: ${err.message}`);
      process.exit(1);
    }
  });
}

startServer();

// ── Cleanup ─────────────────────────────────────────────────────────────

function cleanupAll(): void {
  saveAgentState(agentStatePath, persistDir, agents, nextAgentId, persistedSeats);
  cleanupSpawnedClaudes();
  daemonHub.stop();
  for (const watcher of watchers) {
    watcher.stop();
  }
  layoutWatcher.stop();
  clearInterval(agentStateSaveTimer);
  clearInterval(subagentSuspendTimer);
  clearInterval(heartbeatTimer);
  stopGithubPolling();
  stopShareCleanup();
  server.close();
}

// Graceful shutdown
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    try { unlinkSync(join(homedir(), ".pixel-agents", ".server.pid")); } catch {}
    cleanupAll();
    process.exit(0);
  });
}
