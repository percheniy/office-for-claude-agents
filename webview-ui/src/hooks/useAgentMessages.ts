/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { useState, useCallback } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { AgentStats, AgentRoleInfo, AgentDetails, ConversationMessage } from './useExtensionMessages.js'
import { vscode } from '../vscodeApi.js'
import { getModelShortName } from '../modelInfo.js'

export interface AgentMessagesState {
  agents: number[]
  selectedAgent: number | null
  agentStatsMap: Map<number, AgentStats>
  agentRolesMap: Map<number, AgentRoleInfo>
  agentTeamInfoMap: Map<number, { teamName?: string; isTeamLead?: boolean }>
  agentProviders: Map<number, string>
  agentDetailsState: AgentDetails | null
  agentConversationState: { id: number; messages: ConversationMessage[] } | null
  requestAgentDetails: (id: number) => void
  requestAgentConversation: (id: number) => void
  setAgents: React.Dispatch<React.SetStateAction<number[]>>
  setSelectedAgent: React.Dispatch<React.SetStateAction<number | null>>
  setAgentStatsMap: React.Dispatch<React.SetStateAction<Map<number, AgentStats>>>
  setAgentRolesMap: React.Dispatch<React.SetStateAction<Map<number, AgentRoleInfo>>>
  setAgentTeamInfoMap: React.Dispatch<React.SetStateAction<Map<number, { teamName?: string; isTeamLead?: boolean }>>>
  setAgentProviders: React.Dispatch<React.SetStateAction<Map<number, string>>>
  setAgentDetailsState: React.Dispatch<React.SetStateAction<AgentDetails | null>>
  setAgentConversationState: React.Dispatch<React.SetStateAction<{ id: number; messages: ConversationMessage[] } | null>>
}

/**
 * Manages agent CRUD state: agents list, stats, roles, team info, details, conversation.
 * Does NOT handle message dispatch — that remains in useExtensionMessages.
 */
export function useAgentMessages(): AgentMessagesState {
  const [agents, setAgents] = useState<number[]>([])
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null)
  const [agentStatsMap, setAgentStatsMap] = useState<Map<number, AgentStats>>(new Map())
  const [agentRolesMap, setAgentRolesMap] = useState<Map<number, AgentRoleInfo>>(new Map())
  const [agentTeamInfoMap, setAgentTeamInfoMap] = useState<Map<number, { teamName?: string; isTeamLead?: boolean }>>(new Map())
  const [agentProviders, setAgentProviders] = useState<Map<number, string>>(new Map())
  const [agentDetailsState, setAgentDetailsState] = useState<AgentDetails | null>(null)
  const [agentConversationState, setAgentConversationState] = useState<{ id: number; messages: ConversationMessage[] } | null>(null)

  const requestAgentDetails = useCallback((id: number) => {
    vscode.postMessage({ type: 'requestAgentDetails', id })
  }, [])

  const requestAgentConversation = useCallback((id: number) => {
    vscode.postMessage({ type: 'requestAgentConversation', id })
  }, [])

  return {
    agents,
    selectedAgent,
    agentStatsMap,
    agentRolesMap,
    agentTeamInfoMap,
    agentProviders,
    agentDetailsState,
    agentConversationState,
    requestAgentDetails,
    requestAgentConversation,
    setAgents,
    setSelectedAgent,
    setAgentStatsMap,
    setAgentRolesMap,
    setAgentTeamInfoMap,
    setAgentProviders,
    setAgentDetailsState,
    setAgentConversationState,
  }
}

/**
 * Handles a single message event for agent CRUD types.
 * Returns true if the message was handled, false otherwise.
 */
export function handleAgentMessage(
  msg: any,
  os: OfficeState,
  state: AgentMessagesState,
  saveAgentSeats: (os: OfficeState) => void,
  setAgentTools: React.Dispatch<React.SetStateAction<Record<number, import('../office/types.js').ToolActivity[]>>>,
  setAgentStatuses: React.Dispatch<React.SetStateAction<Record<number, string>>>,
  setSubagentTools: React.Dispatch<React.SetStateAction<Record<number, Record<string, import('../office/types.js').ToolActivity[]>>>>,
  setSubagentCharacters: React.Dispatch<React.SetStateAction<import('./useExtensionMessages.js').SubagentCharacter[]>>,
  showDesktopNotification: (title: string, body: string) => void,
): boolean {
  const {
    setAgents,
    setSelectedAgent,
    setAgentStatsMap,
    setAgentRolesMap,
    setAgentTeamInfoMap,
    setAgentProviders,
    setAgentDetailsState,
    setAgentConversationState,
  } = state

  if (msg.type === 'agentCreated') {
    const id = msg.id as number
    const folderName = msg.folderName as string | undefined
    const parentAgentId = msg.parentAgentId as number | undefined
    const teamName = msg.teamName as string | undefined
    const isTeamLead = msg.isTeamLead as boolean | undefined
    const provider = typeof msg.provider === 'string' ? msg.provider : 'claude'
    setAgentProviders((prev) => {
      const next = new Map(prev)
      next.set(id, provider)
      return next
    })
    // Store team info
    if (teamName || isTeamLead) {
      setAgentTeamInfoMap((prev) => {
        const next = new Map(prev)
        next.set(id, { teamName, isTeamLead })
        return next
      })
    }
    const existing = os.characters.get(id)
    if (existing && parentAgentId && !existing.parentAgentId) {
      existing.parentAgentId = parentAgentId
      existing.isSubagent = true
      os.reassignNearParent(id, parentAgentId)
      saveAgentSeats(os)
    } else if (existing && (existing.leavingOffice || existing.matrixEffect === 'despawn')) {
      os.reviveAgent(id, folderName, parentAgentId)
      setAgents((prev) => (prev.includes(id) ? prev : [...prev, id]))
      setSelectedAgent(id)
    } else if (!existing) {
      setAgents((prev) => (prev.includes(id) ? prev : [...prev, id]))
      setSelectedAgent(id)
      os.addAgent(id, undefined, undefined, undefined, undefined, folderName, parentAgentId)
    }
    showDesktopNotification('New agent joined', `${folderName || 'Agent'} entered the office`)
    saveAgentSeats(os)
    return true
  } else if (msg.type === 'agentRenamed') {
    const id = msg.id as number
    const folderName = msg.folderName as string
    const ch = os.characters.get(id)
    if (ch) {
      ch.folderName = folderName
    }
    return true
  } else if (msg.type === 'agentClosed') {
    const id = msg.id as number
    setAgents((prev) => prev.filter((a) => a !== id))
    setAgentProviders((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    setSelectedAgent((prev) => (prev === id ? null : prev))
    setAgentTools((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
    setAgentStatuses((prev) => {
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
    os.removeAllSubagents(id)
    setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id))
    setAgentStatsMap((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    setAgentRolesMap((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    setAgentTeamInfoMap((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    os.removeAgent(id)
    return true
  } else if (msg.type === 'agentStats') {
    const id = msg.id as number
    const stats: AgentStats = {
      model: msg.model as string | undefined,
      totalInputTokens: msg.totalInputTokens as number,
      totalOutputTokens: msg.totalOutputTokens as number,
      totalCacheRead: msg.totalCacheRead as number,
      totalCacheCreation: msg.totalCacheCreation as number,
      currentContextTokens: msg.currentContextTokens as number | undefined,
      currentContextLimit: msg.currentContextLimit as number | undefined,
      turnCount: msg.turnCount as number,
      totalDurationMs: msg.totalDurationMs as number,
      cacheHitRate: msg.cacheHitRate as number,
    }
    setAgentStatsMap((prev) => {
      const next = new Map(prev)
      next.set(id, stats)
      return next
    })
    return true
  } else if (msg.type === 'agentDetails') {
    const details: AgentDetails = {
      id: msg.id as number,
      model: msg.model as string | undefined,
      gitBranch: msg.gitBranch as string | undefined,
      cwd: msg.cwd as string | undefined,
      sessionId: msg.sessionId as string,
      version: msg.version as string | undefined,
      permissionMode: msg.permissionMode as string | undefined,
      toolHistory: msg.toolHistory as Array<{ name: string; timestamp: string; durationMs?: number }>,
      tokenBreakdown: msg.tokenBreakdown as { input: number; output: number; cacheRead: number; cacheCreation: number },
      contextUsage: msg.contextUsage as { input: number; output: number; cacheRead: number; total: number; limit: number } | undefined,
      turnCount: msg.turnCount as number,
      totalDurationMs: msg.totalDurationMs as number,
      startTime: msg.startTime as string | undefined,
    }
    setAgentDetailsState(details)
    return true
  } else if (msg.type === 'agentConversation') {
    setAgentConversationState({
      id: msg.id as number,
      messages: msg.messages as ConversationMessage[],
    })
    return true
  } else if (msg.type === 'agentConversationUpdate') {
    const newMsg = msg.message as ConversationMessage
    const agentId = msg.id as number
    setAgentConversationState((prev) => {
      if (!prev || prev.id !== agentId) return prev
      return { ...prev, messages: [...prev.messages, newMsg] }
    })
    return true
  } else if (msg.type === 'agentRole') {
    const id = msg.id as number
    const roleInfo: AgentRoleInfo = {
      role: msg.role as string,
      autoDetected: msg.autoDetected as boolean,
      colors: msg.colors as { primary: string; badge: string },
    }
    setAgentRolesMap((prev) => {
      const next = new Map(prev)
      next.set(id, roleInfo)
      return next
    })
    os.setAgentRole(id, roleInfo.role)
    return true
  }

  return false
}
