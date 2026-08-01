import { WebSocket, WebSocketServer } from "ws";
import { mkdirSync, writeFileSync } from "fs";
import type { TrackedAgent, ServerMessage } from "./types.js";
import { getConfig, saveConfig } from "./configPersistence.js";
import { getRoleColors } from "./roleDetector.js";
import { isShareTokenValid, createShareToken, revokeShareToken } from "./shareManager.js";
import {
  writeLayoutToFile,
  loadAllFurniture,
  savePersistedSeats,
  saveRoleOverrides,
  persistDir,
  persistedSeatsPath,
} from "./layoutManager.js";
import {
  agents,
  nextAgentId,
  recentSendMessages,
  buildAgentStatsMessage,
  buildAgentRoleMessage,
  getRoleOverrides,
} from "./agentManager.js";
import { getCachedPipelineIssues } from "./githubPoller.js";
import type { LoadedFurnitureAssets } from "./assetLoader.js";
import type { DaemonHub } from "./daemonHub.js";
import {
  authorizeWebSocketRequest,
  canUsePermissionBypass,
  type ServerSecurityConfig,
} from "./security.js";

// ── Shared state ─────────────────────────────────────────────────────────

const clients = new Set<WebSocket>();
export { clients };

// ── Broadcast ───────────────────────────────────────────────────────────

export function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// ── Heartbeat ───────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 30_000;

export function startHeartbeat(): ReturnType<typeof setInterval> {
  return setInterval(() => {
    for (const ws of clients) {
      if ((ws as unknown as Record<string, boolean>).__isAlive === false) {
        clients.delete(ws);
        ws.terminate();
        continue;
      }
      (ws as unknown as Record<string, boolean>).__isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
}

// ── Send initial data ───────────────────────────────────────────────────

export interface InitialDataDeps {
  characterSprites: { characters: unknown[] } | null;
  wallTiles: { sets: unknown[] } | null;
  floorTiles: { sprites: unknown[] } | null;
  furnitureAssets: LoadedFurnitureAssets | null;
  currentLayout: { value: Record<string, unknown> | null };
  layoutWasReset: boolean;
  isDev: boolean;
  persistedSeats: Record<number, { palette: number; hueShift: number; seatId: string | null }> | null;
  previousAgentState: { agents: Array<{ id: number; palette?: number; hueShift?: number; seatId?: string | null }> } | null;
  testAgentData: Map<number, { folderName: string; role: string; parentAgentId?: number; model: string }>;
}

let initDeps: InitialDataDeps;
let getFurnitureAssets: () => LoadedFurnitureAssets | null;
let setFurnitureAssets: (a: LoadedFurnitureAssets | null) => void;

export function initWsHandler(deps: InitialDataDeps & {
  getFurnitureAssets: () => LoadedFurnitureAssets | null;
  setFurnitureAssets: (a: LoadedFurnitureAssets | null) => void;
}): void {
  initDeps = deps;
  getFurnitureAssets = deps.getFurnitureAssets;
  setFurnitureAssets = deps.setFurnitureAssets;
}

function sendInitialData(ws: WebSocket, isReadOnly: boolean): void {
  const cfg = getConfig();
  ws.send(JSON.stringify({
    type: "settingsLoaded",
    soundEnabled: cfg.soundEnabled,
    desktopNotifications: cfg.desktopNotifications,
    externalAssetDirectories: cfg.externalAssetDirectories,
    githubTasks: isReadOnly ? { enabled: false, maxIssues: 0, pipeline: { enabled: false, states: [], gates: [] } } : cfg.githubTasks,
    serverMode: initDeps.isDev ? "dev" : "prod",
  }));

  if (initDeps.characterSprites) {
    ws.send(JSON.stringify({ type: "characterSpritesLoaded", characters: initDeps.characterSprites.characters }));
  }
  if (initDeps.wallTiles) {
    ws.send(JSON.stringify({ type: "wallTilesLoaded", sets: initDeps.wallTiles.sets }));
  }
  if (initDeps.floorTiles) {
    ws.send(JSON.stringify({ type: "floorTilesLoaded", sprites: initDeps.floorTiles.sprites }));
  }

  const furnitureAssets = getFurnitureAssets();
  if (furnitureAssets) {
    ws.send(JSON.stringify({
      type: "furnitureAssetsLoaded",
      catalog: furnitureAssets.catalog,
      sprites: furnitureAssets.sprites,
    }));
  }

  const cachedIssues = getCachedPipelineIssues();
  if (!isReadOnly && cachedIssues.length > 0) {
    ws.send(JSON.stringify({ type: "pipelineIssues", issues: cachedIssues }));
  }

  // Send existing agents with persisted seat metadata
  const agentList = Array.from(agents.values());
  const agentIds = agentList.map((a) => a.id);
  const folderNames: Record<number, string> = {};
  const agentMeta: Record<number, { palette?: number; hueShift?: number; seatId?: string }> = {};
  const parentAgentIds: Record<number, number> = {};
  const teamNames: Record<number, string> = {};
  const isTeamLeads: Record<number, boolean> = {};
  for (const a of agentList) {
    folderNames[a.id] = a.projectName;
    if (a.parentAgentId !== undefined) {
      parentAgentIds[a.id] = a.parentAgentId;
    }
    if (a.teamName) {
      teamNames[a.id] = a.teamName;
    }
    if (a.isTeamLead) {
      isTeamLeads[a.id] = true;
    }
    if (initDeps.persistedSeats?.[a.id]) {
      const s = initDeps.persistedSeats[a.id];
      agentMeta[a.id] = { palette: s.palette, hueShift: s.hueShift, seatId: s.seatId ?? undefined };
    } else {
      const prev = initDeps.previousAgentState?.agents.find((p) => p.id === a.id);
      if (prev) {
        agentMeta[a.id] = { palette: prev.palette, hueShift: prev.hueShift, seatId: prev.seatId ?? undefined };
      }
    }
  }
  ws.send(JSON.stringify({ type: "existingAgents", agents: agentIds, folderNames, agentMeta, parentAgentIds, teamNames, isTeamLeads }));

  for (const a of agentList) {
    ws.send(JSON.stringify(buildAgentStatsMessage(a)));
  }
  for (const a of agentList) {
    ws.send(JSON.stringify(buildAgentRoleMessage(a)));
  }
  for (const a of agentList) {
    if (a.activeTools.size === 0) {
      ws.send(JSON.stringify({ type: "agentStatus", id: a.id, status: "waiting" }));
    }
  }

  const currentLayout = initDeps.currentLayout.value;
  if (currentLayout) {
    ws.send(JSON.stringify({ type: "layoutLoaded", layout: currentLayout, version: 1, wasReset: initDeps.layoutWasReset }));
  } else {
    ws.send(JSON.stringify({ type: "layoutLoaded", layout: null, version: 0, wasReset: false }));
  }

  // Send accumulated SendMessage events — only from agents that still exist
  const activeIds = new Set(agentList.map(a => a.id));
  for (const sm of recentSendMessages) {
    if (activeIds.has(sm.id)) {
      ws.send(JSON.stringify({ type: "agentSendMessage", ...sm }));
    }
  }

  // Re-send test agents
  for (const [id, data] of initDeps.testAgentData) {
    ws.send(JSON.stringify({ type: "agentCreated", id, folderName: data.folderName, parentAgentId: data.parentAgentId }));
    ws.send(JSON.stringify({ type: "agentRole", id, role: data.role, autoDetected: true, colors: getRoleColors(data.role) }));
    ws.send(JSON.stringify({
      type: "agentStats", id, model: data.model,
      totalInputTokens: 10000, totalOutputTokens: 5000, totalCacheRead: 0,
      totalCacheCreation: 0, turnCount: 5, totalDurationMs: 60000, cacheHitRate: 0,
    }));
  }
}

// ── Connection handler ──────────────────────────────────────────────────

export function setupConnectionHandler(
  wss: WebSocketServer,
  deps: {
    PORT: number;
    security: ServerSecurityConfig;
    assetsRoot: string;
    currentLayout: { value: Record<string, unknown> | null };
    layoutWatcher: { markOwnWrite: () => void };
    launchClaude: (bypass: boolean) => void;
    openSessionsFolder: () => void;
    testAgentIds: Set<number>;
    testAgentData: Map<number, { folderName: string; role: string; parentAgentId?: number; model: string }>;
    getNextAgentId: () => number;
    daemonHub: DaemonHub;
  },
): void {
  wss.on("connection", (ws, req) => {
    (ws as unknown as Record<string, boolean>).__isAlive = true;
    ws.on("pong", () => { (ws as unknown as Record<string, boolean>).__isAlive = true; });

    const authorization = authorizeWebSocketRequest(req, deps.security, isShareTokenValid);
    if (!authorization.authorized) {
      ws.close(4003, authorization.reason || "Unauthorized");
      return;
    }
    const isReadOnly = authorization.readOnly;
    (ws as any).__readOnly = isReadOnly;
    (ws as any).__host = req.headers.host;
    (ws as any).__canUsePermissionBypass = canUsePermissionBypass(
      deps.security.remoteMode,
      req.socket.remoteAddress,
    );

    clients.add(ws);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type !== "webviewReady" && msg.type !== "ready") {
          console.log(`[Server] WS msg: ${msg.type}`);
        }
        if ((ws as any).__readOnly) {
          const allowedTypes = ["webviewReady", "ready", "requestAgentDetails", "requestAgentConversation"];
          if (!allowedTypes.includes(msg.type)) return;
        }

        if (msg.type === "webviewReady" || msg.type === "ready") {
          sendInitialData(ws, !!(ws as any).__readOnly);
        } else if (msg.type === "saveLayout") {
          try {
            deps.currentLayout.value = msg.layout as Record<string, unknown>;
            deps.layoutWatcher.markOwnWrite();
            writeLayoutToFile(deps.currentLayout.value);
            const data = JSON.stringify({ type: "layoutLoaded", layout: msg.layout, version: 1, wasReset: false });
            for (const client of clients) {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(data);
              }
            }
          } catch (err) {
            console.error(`[Server] Failed to save layout: ${err instanceof Error ? err.message : err}`);
          }
        } else if (msg.type === "saveAgentSeats") {
          savePersistedSeats(msg.seats);
        } else if (msg.type === "saveSoundEnabled") {
          const cfg = getConfig();
          cfg.soundEnabled = !!msg.enabled;
          saveConfig(cfg);
          console.log(`[Server] Sound enabled: ${cfg.soundEnabled}`);
        } else if (msg.type === "saveDesktopNotifications") {
          const cfg = getConfig();
          cfg.desktopNotifications = !!msg.enabled;
          saveConfig(cfg);
          console.log(`[Server] Desktop notifications: ${cfg.desktopNotifications}`);
        } else if (msg.type === "openSessionsFolder") {
          deps.openSessionsFolder();
        } else if (msg.type === "addExternalAssetDirectory") {
          const newPath = typeof msg.path === "string" ? msg.path.trim() : "";
          if (!newPath) return;
          const cfg = getConfig();
          if (!cfg.externalAssetDirectories.includes(newPath)) {
            cfg.externalAssetDirectories.push(newPath);
            saveConfig(cfg);
            const newAssets = loadAllFurniture(deps.assetsRoot);
            setFurnitureAssets(newAssets);
            if (newAssets) {
              broadcast({
                type: "furnitureAssetsLoaded",
                catalog: newAssets.catalog,
                sprites: newAssets.sprites,
              });
            }
            const dirMsg = JSON.stringify({
              type: "externalAssetDirectoriesUpdated",
              dirs: cfg.externalAssetDirectories,
            });
            for (const client of clients) {
              if (client.readyState === WebSocket.OPEN) {
                client.send(dirMsg);
              }
            }
            console.log(`[Server] Added external asset directory: ${newPath}`);
          }
        } else if (msg.type === "removeExternalAssetDirectory") {
          const removePath = typeof msg.path === "string" ? msg.path : "";
          const cfg = getConfig();
          cfg.externalAssetDirectories = cfg.externalAssetDirectories.filter(
            (d) => d !== removePath,
          );
          saveConfig(cfg);
          const newAssets = loadAllFurniture(deps.assetsRoot);
          setFurnitureAssets(newAssets);
          if (newAssets) {
            broadcast({
              type: "furnitureAssetsLoaded",
              catalog: newAssets.catalog,
              sprites: newAssets.sprites,
            });
          }
          const dirMsg = JSON.stringify({
            type: "externalAssetDirectoriesUpdated",
            dirs: cfg.externalAssetDirectories,
          });
          for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(dirMsg);
            }
          }
          console.log(`[Server] Removed external asset directory: ${removePath}`);
        } else if (msg.type === "openClaude") {
          deps.launchClaude(false);
        } else if (msg.type === "openClaudeBypass") {
          if ((ws as any).__canUsePermissionBypass) {
            deps.launchClaude(true);
          } else {
            console.warn("[Server] Blocked permission-bypassed Claude launch from a non-loopback client");
          }
        } else if (msg.type === "requestAgentDetails") {
          const requestedId = msg.id as number;
          for (const agent of agents.values()) {
            if (agent.id === requestedId) {
              const details: ServerMessage = {
                type: "agentDetails",
                id: agent.id,
                model: agent.model,
                gitBranch: agent.gitBranch,
                cwd: agent.cwd,
                sessionId: agent.sessionId,
                version: agent.version,
                permissionMode: agent.permissionMode,
                toolHistory: agent.toolHistory,
                tokenBreakdown: {
                  input: agent.totalInputTokens,
                  output: agent.totalOutputTokens,
                  cacheRead: agent.totalCacheRead,
                  cacheCreation: agent.totalCacheCreation,
                },
                contextUsage: agent.currentContextLimit
                  ? {
                      input: agent.currentInputTokens ?? 0,
                      output: agent.currentOutputTokens ?? 0,
                      cacheRead: agent.currentCacheRead ?? 0,
                      total: agent.currentContextTokens ?? 0,
                      limit: agent.currentContextLimit,
                    }
                  : undefined,
                turnCount: agent.turnCount,
                totalDurationMs: agent.totalDurationMs,
                startTime: agent.startTime,
              };
              ws.send(JSON.stringify(details));
              break;
            }
          }
        } else if (msg.type === "requestAgentConversation") {
          const requestedId = msg.id as number;
          for (const agent of agents.values()) {
            if (agent.id === requestedId) {
              ws.send(JSON.stringify({
                type: "agentConversation",
                id: agent.id,
                messages: agent.conversation || [],
              }));
              break;
            }
          }
        } else if (msg.type === "setAgentRole") {
          const targetId = msg.id as number;
          const newRole = msg.role as string;
          const colors = getRoleColors(newRole);
          const overrides = getRoleOverrides();
          overrides[targetId] = { role: newRole, colors };
          saveRoleOverrides(overrides);
          broadcast({
            type: "agentRole",
            id: targetId,
            role: newRole,
            autoDetected: false,
            colors,
          });
          console.log(`[Server] Role override set: agent ${targetId} → "${newRole}"`);
        } else if (msg.type === "createShareLink") {
          if ((ws as any).__readOnly) return;
          const cfg = getConfig();
          const share = createShareToken(msg.durationMs as number);
          const baseUrl = cfg.shareProxyUrl
            ? cfg.shareProxyUrl.replace(/\/$/, "")
            : `http://${(ws as any).__host || `localhost:${deps.PORT}`}`;
          const url = `${baseUrl}/share/${share.token}`;
          ws.send(JSON.stringify({
            type: "shareLinkCreated",
            token: share.token,
            url,
            expiresAt: share.expiresAt,
            durationMs: share.durationMs,
          }));
          console.log(`[Server] Share link created: ${url} (expires in ${share.durationMs / 60000}min)`);
        } else if (msg.type === "revokeShareLink") {
          if ((ws as any).__readOnly) return;
          revokeShareToken(msg.token as string);
          ws.send(JSON.stringify({ type: "shareLinkRevoked", token: msg.token }));
          console.log(`[Server] Share link revoked: ${msg.token}`);
        } else if (msg.type === "removeTestAgents") {
          const toRemove: number[] = [];
          for (const id of deps.testAgentIds) {
            toRemove.push(id);
            broadcast({ type: "agentClosed", id });
          }
          deps.testAgentIds.clear();
          deps.testAgentData.clear();
          console.log(`[Server] Removed ${toRemove.length} test agents`);
        } else if (msg.type === "spawnTestAgents") {
          for (const id of deps.testAgentIds) {
            broadcast({ type: "agentClosed", id });
          }
          deps.testAgentIds.clear();
          deps.testAgentData.clear();

          let rootParentId: number | undefined;
          for (const [, a] of agents) {
            if (!a.parentAgentId && !a.teamName && a.provider === "claude") {
              rootParentId = a.id;
              break;
            }
          }
          const hierarchy = [
            { name: "pipeDebate",    role: "lead",          parent: -1, model: "claude-opus-4-6",    tokens: [15000, 8000], useRootParent: true },
            { name: "advocate-cur",  role: "Code Reviewer", parent: 0,  model: "claude-opus-4-6",    tokens: [12000, 6000] },
            { name: "advocate-auto", role: "Explore",       parent: 0,  model: "claude-opus-4-6",    tokens: [9000, 4500] },
            { name: "judge",         role: "Plan",          parent: 0,  model: "claude-opus-4-6",    tokens: [18000, 9000] },
            { name: "codeExplorer",  role: "Explore",       parent: 1,  model: "claude-sonnet-4-6",  tokens: [4000, 2000] },
            { name: "testRunner",    role: "test-runner",   parent: 1,  model: "claude-sonnet-4-6",  tokens: [3000, 1500] },
            { name: "cofehleb",      role: "worker",        parent: 0,  model: "claude-opus-4-6",    tokens: [6000, 3000], coffee: true },
            { name: "kurilshik",    role: "worker",        parent: 0,  model: "claude-opus-4-6",    tokens: [5000, 2500], smoke: true },
          ] as Array<{ name: string; role: string; parent: number; model: string; tokens: number[]; useRootParent?: boolean; coffee?: boolean; smoke?: boolean }>;

          let currentNextId = deps.getNextAgentId();
          const ids = hierarchy.map(() => currentNextId++);
          console.log(`[Server] Spawning ${ids.length} test agents (4-level hierarchy, staggered)`);

          for (let i = 0; i < hierarchy.length; i++) {
            setTimeout(() => {
              const h = hierarchy[i];
              const id = ids[i];
              const parentId = h.useRootParent ? rootParentId : (h.parent >= 0 ? ids[h.parent] : undefined);
              broadcast({ type: "agentCreated", id, folderName: h.name, parentAgentId: parentId });
              broadcast({
                type: "agentStats", id, model: h.model,
                totalInputTokens: h.tokens[0], totalOutputTokens: h.tokens[1],
                totalCacheRead: Math.floor(h.tokens[0] * 0.3), totalCacheCreation: Math.floor(h.tokens[0] * 0.1),
                turnCount: Math.floor(Math.random() * 8) + 2,
                totalDurationMs: Math.floor(Math.random() * 200000) + 30000,
                cacheHitRate: Math.floor(Math.random() * 40) + 10,
              });
              broadcast({ type: "agentRole", id, role: h.role, autoDetected: true, colors: getRoleColors(h.role) });
              if (h.coffee || h.smoke) {
                setTimeout(() => {
                  broadcast({ type: "agentStatus", id, status: "waiting" });
                  broadcast({ type: h.coffee ? "forceCoffee" : "forceSmoke", id } as any);
                }, 3000);
              }
              deps.testAgentIds.add(id);
              deps.testAgentData.set(id, { folderName: h.name, role: h.role, parentAgentId: parentId, model: h.model });
              console.log(`  Test agent ${id}: ${h.name} (${h.role})${parentId ? ` [sub of ${parentId}]` : ""}${h.coffee ? " ☕" : ""}${h.smoke ? " 🚬" : ""}`);
            }, i * 800);
          }
        } else if (msg.type === "addDaemon") {
          const cfg = getConfig();
          if (!cfg.daemons.some((d: any) => d.url === msg.url)) {
            cfg.daemons.push({ url: msg.url, name: msg.name, enabled: true });
            saveConfig(cfg);
            deps.daemonHub.stop();
            deps.daemonHub.start(cfg.daemons);
          }
          ws.send(JSON.stringify({ type: "daemonStatus", daemons: deps.daemonHub.getConnections() }));
        } else if (msg.type === "removeDaemon") {
          const cfg = getConfig();
          cfg.daemons = cfg.daemons.filter((d: any) => d.url !== msg.url);
          saveConfig(cfg);
          deps.daemonHub.stop();
          deps.daemonHub.start(cfg.daemons);
          ws.send(JSON.stringify({ type: "daemonStatus", daemons: deps.daemonHub.getConnections() }));
        } else if (msg.type === "toggleDaemon") {
          const cfg = getConfig();
          const daemon = cfg.daemons.find((d: any) => d.url === msg.url);
          if (daemon) {
            daemon.enabled = msg.enabled;
            saveConfig(cfg);
            deps.daemonHub.stop();
            deps.daemonHub.start(cfg.daemons);
          }
          ws.send(JSON.stringify({ type: "daemonStatus", daemons: deps.daemonHub.getConnections() }));
        } else if (msg.type === "getDaemonStatus") {
          ws.send(JSON.stringify({ type: "daemonStatus", daemons: deps.daemonHub.getConnections() }));
        }
      } catch (err) {
        console.error(`[Server] WS message error:`, err instanceof Error ? err.message : err);
      }
    });

    ws.on("close", () => clients.delete(ws));
  });
}
