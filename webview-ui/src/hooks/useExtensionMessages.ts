import { useState, useEffect, useRef, useCallback } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { OfficeLayout, ToolActivity } from '../office/types.js'
import { extractToolName } from '../office/toolUtils.js'
import { migrateLayoutColors } from '../office/layout/layoutSerializer.js'
import { buildDynamicCatalog } from '../office/layout/furnitureCatalog.js'
import { setFloorSprites } from '../office/floorTiles.js'
import { setWallSprites } from '../office/wallTiles.js'
import { setCharacterTemplates } from '../office/sprites/spriteData.js'
import { vscode } from '../vscodeApi.js'
import { playDoneSound, setSoundEnabled, showDesktopNotification, setDesktopNotificationsEnabled } from '../notificationSound.js'
import { useAgentMessages, handleAgentMessage } from './useAgentMessages.js'
import { useAssetMessages, handleAssetMessage } from './useAssetMessages.js'

export interface SubagentCharacter {
  id: number
  parentAgentId: number
  parentToolId: string
  label: string
}

export interface FurnitureAsset {
  id: string
  name: string
  label: string
  category: string
  file: string
  width: number
  height: number
  footprintW: number
  footprintH: number
  isDesk: boolean
  canPlaceOnWalls: boolean
  groupId?: string
  canPlaceOnSurfaces?: boolean
  backgroundTiles?: number
  orientation?: string
  state?: string
  mirrorSide?: boolean
  rotationScheme?: string
  animationGroup?: string
  frame?: number
}

export interface AgentStats {
  model?: string
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheRead: number
  totalCacheCreation: number
  currentContextTokens?: number
  currentContextLimit?: number
  turnCount: number
  totalDurationMs: number
  cacheHitRate: number
}

export type AgentSessionState = 'live' | 'detached' | 'stale' | 'dead'

export interface AgentSessionInfo {
  state: AgentSessionState
  host: string
  pid?: number
  processStartTime?: string
  tmuxTarget?: string
  tmuxAttached?: boolean
}

export interface WorkspaceFolder {
  name: string
  path: string
}

export interface AgentRoleInfo {
  role: string
  autoDetected: boolean
  colors: { primary: string; badge: string }
}

export interface AgentDetails {
  id: number
  model?: string
  gitBranch?: string
  cwd?: string
  sessionId: string
  version?: string
  permissionMode?: string
  toolHistory: Array<{ name: string; timestamp: string; durationMs?: number }>
  tokenBreakdown: { input: number; output: number; cacheRead: number; cacheCreation: number }
  contextUsage?: { input: number; output: number; cacheRead: number; total: number; limit: number }
  turnCount: number
  totalDurationMs: number
  startTime?: string
}

export interface ConversationMessage {
  role: 'assistant' | 'user'
  text: string
  timestamp: string
  toolNames?: string[]
}

export interface GateStatus {
  gate: number
  status: 'pass' | 'fail'
  comment: string
  timestamp: string
}

export interface GithubTaskStateConfig {
  id: string
  label: string
  color: string
  labels: string[]
}

export interface GithubTaskGateConfig {
  gate: number
  label: string
}

export interface GithubTasksConfig {
  enabled: boolean
  maxIssues: number
  pipeline: {
    enabled: boolean
    states: GithubTaskStateConfig[]
    gates: GithubTaskGateConfig[]
  }
}

export interface PipelineIssue {
  number: number
  title: string
  labels: string[]
  state: string
  pipelineState: string
  repo: string
  gates: GateStatus[]
}

export interface ExtensionMessageState {
  agents: number[]
  selectedAgent: number | null
  agentTools: Record<number, ToolActivity[]>
  agentStatuses: Record<number, string>
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  subagentCharacters: SubagentCharacter[]
  layoutReady: boolean
  layoutWasReset: boolean
  layoutBackupFileName: string | null
  agentProviders: Map<number, string>
  agentSessions: Map<number, AgentSessionInfo>
  loadedAssets?: { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> }
  workspaceFolders: WorkspaceFolder[]
  externalAssetDirectories: string[]
  githubTasks: GithubTasksConfig
  agentStats: Map<number, AgentStats>
  agentRoles: Map<number, AgentRoleInfo>
  agentDetails: AgentDetails | null
  requestAgentDetails: (id: number) => void
  agentConversation: { id: number; messages: ConversationMessage[] } | null
  requestAgentConversation: (id: number) => void
  pipelineIssues: PipelineIssue[]
  sendMessages: Array<{ id: number; from: string; to: string; message: string; timestamp: number }>
  agentTeamInfo: Map<number, { teamName?: string; isTeamLead?: boolean }>
}

function saveAgentSeats(os: OfficeState): void {
  const seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> = {}
  for (const ch of os.characters.values()) {
    if (ch.isSubagent) continue
    seats[ch.id] = { palette: ch.palette, hueShift: ch.hueShift, seatId: ch.seatId }
  }
  vscode.postMessage({ type: 'saveAgentSeats', seats })
}

export function useExtensionMessages(
  getOfficeState: () => OfficeState,
  onLayoutLoaded?: (layout: OfficeLayout) => void,
  isEditDirty?: () => boolean,
): ExtensionMessageState {
  // ── Sub-hooks ──────────────────────────────────────────────────────
  const agentState = useAgentMessages()
  const assetState = useAssetMessages()

  // ── Remaining local state ──────────────────────────────────────────
  const [agentTools, setAgentTools] = useState<Record<number, ToolActivity[]>>({})
  const [agentStatuses, setAgentStatuses] = useState<Record<number, string>>({})
  const [subagentTools, setSubagentTools] = useState<Record<number, Record<string, ToolActivity[]>>>({})
  const [subagentCharacters, setSubagentCharacters] = useState<SubagentCharacter[]>([])
  const [layoutReady, setLayoutReady] = useState(false)
  const [layoutWasReset, setLayoutWasReset] = useState(false)
  const [layoutBackupFileName, setLayoutBackupFileName] = useState<string | null>(null)
  const [pipelineIssues, setPipelineIssues] = useState<PipelineIssue[]>([])
  const [sendMessages, setSendMessages] = useState<Array<{ id: number; from: string; to: string; message: string; timestamp: number }>>([])
  const [shareLink, setShareLink] = useState<{ url: string; expiresAt: number } | null>(null)

  // Track whether initial layout has been loaded (ref to avoid re-render)
  const layoutReadyRef = useRef(false)

  useEffect(() => {
    // Buffer agents from existingAgents until layout is loaded
    let pendingAgents: Array<{ id: number; palette?: number; hueShift?: number; seatId?: string; folderName?: string; parentAgentId?: number }> = []

    const handler = (e: MessageEvent) => {
      const msg = e.data
      const os = getOfficeState()

      // ── Try sub-hook handlers first ────────────────────────────────
      if (handleAgentMessage(
        msg, os, agentState, saveAgentSeats,
        setAgentTools, setAgentStatuses, setSubagentTools, setSubagentCharacters,
        showDesktopNotification,
      )) return

      if (handleAssetMessage(msg, assetState)) return

      // ── Layout, tools, WebSocket, pipeline — remain here ───────────
      if (msg.type === 'layoutLoaded') {
        // Skip external layout updates while editor has unsaved changes
        if (layoutReadyRef.current && isEditDirty?.()) {
          console.log('[Webview] Skipping external layout update — editor has unsaved changes')
          return
        }
        const rawLayout = msg.layout as OfficeLayout | null
        const layout = rawLayout && rawLayout.version === 1 ? migrateLayoutColors(rawLayout) : null
        if (layout) {
          os.rebuildFromLayout(layout)
          onLayoutLoaded?.(layout)
        } else {
          // Default layout — snapshot whatever OfficeState built
          onLayoutLoaded?.(os.getLayout())
        }
        // Topological sort: parents before children so findFreeSeatNear() finds parent character
        const pendingIds = new Set(pendingAgents.map(p => p.id))
        const sorted: typeof pendingAgents = []
        const visited = new Set<number>()
        const visit = (p: typeof pendingAgents[0]) => {
          if (visited.has(p.id)) return
          visited.add(p.id)
          if (p.parentAgentId !== undefined && pendingIds.has(p.parentAgentId)) {
            const parent = pendingAgents.find(q => q.id === p.parentAgentId)
            if (parent) visit(parent)
          }
          sorted.push(p)
        }
        for (const p of pendingAgents) visit(p)
        // Existing agents restore instantly (they teleport to saved seats)
        for (const p of sorted) {
          os.addAgent(p.id, p.palette, p.hueShift, p.seatId, true, p.folderName, p.parentAgentId)
        }
        pendingAgents = []
        // Force-sweep: ensure all boss/lead agents sit in role-restricted seats
        os.enforceRoleSeats()
        // Cluster sweep: reassign children to seats nearer their parent
        os.enforceTeamClusters()
        layoutReadyRef.current = true
        setLayoutReady(true)
        if (msg.wasReset) {
          setLayoutWasReset(true)
          setLayoutBackupFileName(typeof msg.backupFileName === 'string' ? msg.backupFileName : null)
        } else if (layoutReadyRef.current) {
          setLayoutWasReset(false)
          setLayoutBackupFileName(null)
        }
        if (os.characters.size > 0) {
          saveAgentSeats(os)
        }
      } else if (msg.type === 'existingAgents') {
        const incoming = msg.agents as number[]
        const meta = (msg.agentMeta || {}) as Record<number, { palette?: number; hueShift?: number; seatId?: string }>
        const folderNames = (msg.folderNames || {}) as Record<number, string>
        const incomingProviders = (msg.providers || {}) as Record<number, string>
        agentState.setAgentProviders((prev) => {
          const next = new Map(prev)
          for (const id of incoming) next.set(id, incomingProviders[id] || 'claude')
          return next
        })
        const incomingSessions = (msg.sessionStates || {}) as Record<number, AgentSessionInfo>
        agentState.setAgentSessions((prev) => {
          const next = new Map(prev)
          for (const id of incoming) {
            const session = incomingSessions[id]
            if (session) next.set(id, session)
          }
          return next
        })
        const parentAgentIds = (msg.parentAgentIds || {}) as Record<number, number>
        const incomingTeamNames = (msg.teamNames || {}) as Record<number, string>
        const incomingIsTeamLeads = (msg.isTeamLeads || {}) as Record<number, boolean>
        // Store team info for all existing agents
        agentState.setAgentTeamInfoMap((prev) => {
          let changed = false
          const next = new Map(prev)
          for (const id of incoming) {
            if (incomingTeamNames[id] || incomingIsTeamLeads[id]) {
              next.set(id, { teamName: incomingTeamNames[id], isTeamLead: incomingIsTeamLeads[id] })
              changed = true
            }
          }
          return changed ? next : prev
        })
        // Buffer agents — they'll be added in layoutLoaded after seats are built
        for (const id of incoming) {
          const m = meta[id]
          pendingAgents.push({ id, palette: m?.palette, hueShift: m?.hueShift, seatId: m?.seatId, folderName: folderNames[id], parentAgentId: parentAgentIds[id] })
        }
        agentState.setAgents((prev) => {
          const ids = new Set(prev)
          const merged = [...prev]
          for (const id of incoming) {
            if (!ids.has(id)) {
              merged.push(id)
            }
          }
          return merged.sort((a, b) => a - b)
        })
      } else if (msg.type === 'agentToolStart') {
        const id = msg.id as number
        const toolId = msg.toolId as string
        const status = msg.status as string
        setAgentTools((prev) => {
          const list = prev[id] || []
          if (list.some((t) => t.toolId === toolId)) return prev
          return { ...prev, [id]: [...list, { toolId, status, done: false }] }
        })
        const toolName = extractToolName(status)
        os.setAgentTool(id, toolName)
        os.setAgentActive(id, true)
        os.clearPermissionBubble(id)
        os.showActivityBubble(id, status)
        // Create sub-agent character for Task tool subtasks
        if (status.startsWith('Subtask:')) {
          const label = status.slice('Subtask:'.length).trim()
          const subId = os.addSubagent(id, toolId)
          setSubagentCharacters((prev) => {
            if (prev.some((s) => s.id === subId)) return prev
            return [...prev, { id: subId, parentAgentId: id, parentToolId: toolId, label }]
          })
        }
      } else if (msg.type === 'agentToolDone') {
        const id = msg.id as number
        const toolId = msg.toolId as string
        setAgentTools((prev) => {
          const list = prev[id]
          if (!list) return prev
          return {
            ...prev,
            [id]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
          }
        })
      } else if (msg.type === 'agentToolsClear') {
        const id = msg.id as number
        setAgentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        // Remove all sub-agent characters belonging to this agent
        os.removeAllSubagents(id)
        setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id))
        os.setAgentTool(id, null)
        os.clearPermissionBubble(id)
        {
          const ch = os.characters.get(id)
          const agentName = ch?.folderName || `agent-${id}`
          showDesktopNotification(`${agentName} finished`, 'Turn completed.')
        }
      } else if (msg.type === 'agentSelected') {
        const id = msg.id as number
        agentState.setSelectedAgent(id)
      } else if (msg.type === 'agentStatus') {
        const id = msg.id as number
        const status = msg.status as string
        setAgentStatuses((prev) => {
          if (status === 'active') {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          }
          return { ...prev, [id]: status }
        })
        os.setAgentActive(id, status === 'active')
        if (status === 'waiting') {
          os.showWaitingBubble(id)
        }
      } else if (msg.type === 'forceCoffee') {
        const id = msg.id as number
        os.forceCoffeeBreak(id)
      } else if (msg.type === 'forceSmoke') {
        const id = msg.id as number
        os.forceSmokingBreak(id)
      } else if (msg.type === 'agentToolPermission') {
        const id = msg.id as number
        setAgentTools((prev) => {
          const list = prev[id]
          if (!list) return prev
          return {
            ...prev,
            [id]: list.map((t) => (t.done ? t : { ...t, permissionWait: true })),
          }
        })
        os.showPermissionBubble(id)
        os.setAgentActive(id, false) // permission wait = idle, go rest
        playDoneSound()
        {
          const ch = os.characters.get(id)
          const agentName = ch?.folderName || `agent-${id}`
          showDesktopNotification(`${agentName} needs approval`, 'An agent is waiting for your permission.')
        }
      } else if (msg.type === 'subagentToolPermission') {
        const id = msg.id as number
        const parentToolId = msg.parentToolId as string
        // Show permission bubble on the sub-agent character
        const subId = os.getSubagentId(id, parentToolId)
        if (subId !== null) {
          os.showPermissionBubble(subId)
          os.setAgentActive(subId, false) // permission wait = idle
        }
        playDoneSound()
      } else if (msg.type === 'agentToolPermissionClear') {
        const id = msg.id as number
        setAgentTools((prev) => {
          const list = prev[id]
          if (!list) return prev
          const hasPermission = list.some((t) => t.permissionWait)
          if (!hasPermission) return prev
          return {
            ...prev,
            [id]: list.map((t) => (t.permissionWait ? { ...t, permissionWait: false } : t)),
          }
        })
        os.clearPermissionBubble(id)
        // Also clear permission bubbles on all sub-agent characters of this parent
        for (const [subId, meta] of os.subagentMeta) {
          if (meta.parentAgentId === id) {
            os.clearPermissionBubble(subId)
          }
        }
      } else if (msg.type === 'subagentToolStart') {
        const id = msg.id as number
        const parentToolId = msg.parentToolId as string
        const toolId = msg.toolId as string
        const status = msg.status as string
        setSubagentTools((prev) => {
          const agentSubs = prev[id] || {}
          const list = agentSubs[parentToolId] || []
          if (list.some((t) => t.toolId === toolId)) return prev
          return { ...prev, [id]: { ...agentSubs, [parentToolId]: [...list, { toolId, status, done: false }] } }
        })
        // Update sub-agent character's tool and active state
        const subId = os.getSubagentId(id, parentToolId)
        if (subId !== null) {
          const subToolName = extractToolName(status)
          os.setAgentTool(subId, subToolName)
          os.setAgentActive(subId, true)
          os.showActivityBubble(subId, status)
        }
      } else if (msg.type === 'subagentToolDone') {
        const id = msg.id as number
        const parentToolId = msg.parentToolId as string
        const toolId = msg.toolId as string
        setSubagentTools((prev) => {
          const agentSubs = prev[id]
          if (!agentSubs) return prev
          const list = agentSubs[parentToolId]
          if (!list) return prev
          return {
            ...prev,
            [id]: { ...agentSubs, [parentToolId]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)) },
          }
        })
        // Set subagent idle so it walks to sofa (reactivates on next subagentToolStart)
        const subId = os.getSubagentId(id, parentToolId)
        if (subId !== null) {
          os.setAgentTool(subId, null)
          os.setAgentActive(subId, false)
        }
      } else if (msg.type === 'subagentClear') {
        const id = msg.id as number
        const parentToolId = msg.parentToolId as string
        setSubagentTools((prev) => {
          const agentSubs = prev[id]
          if (!agentSubs || !(parentToolId in agentSubs)) return prev
          const next = { ...agentSubs }
          delete next[parentToolId]
          if (Object.keys(next).length === 0) {
            const outer = { ...prev }
            delete outer[id]
            return outer
          }
          return { ...prev, [id]: next }
        })
        // Remove sub-agent character
        os.removeSubagent(id, parentToolId)
        setSubagentCharacters((prev) => prev.filter((s) => !(s.parentAgentId === id && s.parentToolId === parentToolId)))
      } else if (msg.type === 'pipelineIssues') {
        const issues = msg.issues as PipelineIssue[]
        setPipelineIssues(issues)
      } else if (msg.type === 'shareLinkCreated') {
        setShareLink({ url: msg.url as string, expiresAt: msg.expiresAt as number })
      } else if (msg.type === 'shareLinkRevoked') {
        setShareLink(null)
      } else if (msg.type === 'agentSendMessage') {
        setSendMessages(prev => [...prev, {
          id: msg.id as number,
          from: msg.from as string,
          to: msg.to as string,
          message: msg.message as string,
          timestamp: (msg.timestamp as number) || Date.now(),
        }].slice(-100))
      }
    }
    window.addEventListener('message', handler)
    vscode.postMessage({ type: 'webviewReady' })
    return () => window.removeEventListener('message', handler)
  }, [getOfficeState])

  return {
    agents: agentState.agents,
    selectedAgent: agentState.selectedAgent,
    agentTools,
    agentStatuses,
    subagentTools,
    subagentCharacters,
    layoutReady,
    layoutWasReset,
    layoutBackupFileName,
    agentProviders: agentState.agentProviders,
    agentSessions: agentState.agentSessions,
    loadedAssets: assetState.loadedAssets,
    workspaceFolders: assetState.workspaceFolders,
    externalAssetDirectories: assetState.externalAssetDirectories,
    githubTasks: assetState.githubTasks,
    agentStats: agentState.agentStatsMap,
    agentRoles: agentState.agentRolesMap,
    agentTeamInfo: agentState.agentTeamInfoMap,
    agentDetails: agentState.agentDetailsState,
    requestAgentDetails: agentState.requestAgentDetails,
    agentConversation: agentState.agentConversationState,
    requestAgentConversation: agentState.requestAgentConversation,
    pipelineIssues,
    sendMessages,
    serverMode: assetState.serverMode,
    shareLink,
  }
}
