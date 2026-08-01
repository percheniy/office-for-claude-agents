/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { useState, useCallback } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { AgentStats, AgentRoleInfo, AgentSessionInfo, GithubTasksConfig, SubagentCharacter, PipelineIssue } from '../hooks/useExtensionMessages.js'
import type { ToolActivity } from '../office/types.js'
import { AgentCard } from './sidebar/AgentCard.js'
import { TasksList } from './sidebar/TasksList.js'

interface LeftSidebarProps {
  agents: number[]
  agentTools: Record<number, ToolActivity[]>
  agentStatuses: Record<number, string>
  githubTasks: GithubTasksConfig
  agentStats: Map<number, AgentStats>
  agentRoles: Map<number, AgentRoleInfo>
  agentTeamInfo: Map<number, { teamName?: string; isTeamLead?: boolean }>
  agentProviders: Map<number, string>
  agentSessions: Map<number, AgentSessionInfo>
  onReattachAgent: (id: number) => void
  onControlAgent: (id: number, action: 'prompt' | 'approve' | 'deny' | 'interrupt', prompt: string | undefined, session: AgentSessionInfo) => void
  subagentCharacters: SubagentCharacter[]
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  officeState: OfficeState
  onInspectAgent: (id: number) => void
  pipelineIssues: PipelineIssue[]
  serverMode?: string
  isShareMode?: boolean
}

export function LeftSidebar({
  agents,
  agentTools,
  agentStatuses,
  githubTasks,
  agentStats,
  agentRoles,
  agentTeamInfo,
  agentProviders,
  agentSessions,
  onReattachAgent,
  onControlAgent,
  subagentCharacters,
  subagentTools,
  officeState,
  onInspectAgent,
  pipelineIssues,
  serverMode,
  isShareMode,
}: LeftSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [tasksCollapsed, setTasksCollapsed] = useState(false)
  const [providerFilter, setProviderFilter] = useState('all')
  const toggleCollapse = useCallback(() => setCollapsed((v) => !v), [])
  const toggleTasksCollapse = useCallback(() => setTasksCollapsed((v) => !v), [])

  const liveIds = new Set<number>()
  for (const id of agents) {
    if (officeState.characters.get(id)) liveIds.add(id)
  }

  const mainAgents = agents.filter((id) => {
    const ch = officeState.characters.get(id)
    if (!ch) return false
    if (!ch.isSubagent) return true
    if (!ch.parentAgentId || !liveIds.has(ch.parentAgentId)) return true
    return false
  })

  const subsByParent = new Map<number, SubagentCharacter[]>()
  for (const sub of subagentCharacters) {
    const list = subsByParent.get(sub.parentAgentId) || []
    list.push(sub)
    subsByParent.set(sub.parentAgentId, list)
  }

  const toolSubIds = new Set(subagentCharacters.map(s => s.id))
  for (const id of agents) {
    const ch = officeState.characters.get(id)
    if (!ch || !ch.isSubagent || !ch.parentAgentId) continue
    if (toolSubIds.has(id)) continue
    const parentId = ch.parentAgentId
    const list = subsByParent.get(parentId) || []
    const roleInfo = agentRoles.get(id)
    list.push({ id, parentAgentId: parentId, parentToolId: '', label: roleInfo?.role || 'subagent' })
    subsByParent.set(parentId, list)
  }

  const totalSubagents = [...subsByParent.values()].reduce((sum, subs) => sum + subs.length, 0)
  const providers = [...new Set(mainAgents.map((id) => agentProviders.get(id) || 'claude'))].sort()
  const filteredMainAgents = providerFilter === 'all'
    ? mainAgents
    : mainAgents.filter((id) => (agentProviders.get(id) || 'claude') === providerFilter)
  const totalCount = mainAgents.length + totalSubagents

  if (collapsed) {
    return (
      <div className="absolute top-2.5 left-2.5 bottom-[60px] z-sidebar flex flex-col items-center py-1.5 w-9 bg-pixel-bg border-2 border-pixel-border shadow-pixel overflow-hidden transition-[width] duration-200">
        <button onClick={toggleCollapse} className="px-1.5 py-0.5 text-[18px] text-pixel-text-dim bg-pixel-btn border-2 border-transparent cursor-pointer hover:bg-pixel-btn-hover" title="Expand sidebar">{'\u25B6'}</button>
        <div className="text-[16px] text-pixel-text-dim mt-2 tracking-[1px]" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
          AGENTS ({totalCount})
        </div>
      </div>
    )
  }

  return (
    <div className="absolute top-2.5 left-2.5 bottom-[60px] z-sidebar flex flex-col w-[280px] bg-pixel-bg border-2 border-pixel-border shadow-pixel overflow-hidden transition-[width] duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b-2 border-pixel-border bg-white/[0.03] shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[18px] text-pixel-accent font-bold">AGENTS</span>
          {serverMode && (
            <span
              className="text-[10px] px-1 font-bold uppercase tracking-[0.5px] leading-[14px]"
              style={{
                background: serverMode === 'dev' ? 'rgba(255,159,67,0.15)' : 'rgba(90,200,140,0.15)',
                color: serverMode === 'dev' ? '#ff9f43' : '#5ac88c',
                border: `1px solid ${serverMode === 'dev' ? 'rgba(255,159,67,0.3)' : 'rgba(90,200,140,0.3)'}`,
              }}
            >
              {serverMode}
            </span>
          )}
          {providers.length > 1 && (
            <select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} className="text-[11px] bg-pixel-btn text-pixel-text border border-pixel-border px-1 py-0.5">
              <option value="all">All</option>
              {providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
            </select>
          )}
        </div>
        <button onClick={toggleCollapse} className="px-1.5 py-0.5 text-[18px] text-pixel-text-dim bg-pixel-btn border-2 border-transparent cursor-pointer hover:bg-pixel-btn-hover" title="Collapse sidebar">{'\u25C0'}</button>
      </div>

      {/* Agents list */}
      <div className="flex-1 overflow-y-auto p-1 min-h-0">
        {filteredMainAgents.length === 0 ? (
            <div className="p-4 text-center text-white/30 text-[18px] italic">
              No agents active
            </div>
          ) : (
            filteredMainAgents.map((id) => (
              <AgentCard
                key={id}
                id={id}
                agentTools={agentTools}
                agentStatuses={agentStatuses}
                agentStats={agentStats}
                agentRoles={agentRoles}
                agentProvider={agentProviders.get(id) || 'claude'}
                agentSession={agentSessions.get(id)}
                onReattachAgent={onReattachAgent}
                onControlAgent={onControlAgent}
                agentTeamInfo={agentTeamInfo}
                subagentCharacters={subagentCharacters}
                subsByParent={subsByParent}
                subagentTools={subagentTools}
                officeState={officeState}
                onInspectAgent={onInspectAgent}
              />
            ))
          )}
      </div>

      {/* Tasks Section (bottom) */}
      {!isShareMode && (
        <TasksList
          githubTasks={githubTasks}
          pipelineIssues={pipelineIssues}
          tasksCollapsed={tasksCollapsed}
          onToggleTasksCollapse={toggleTasksCollapse}
        />
      )}
    </div>
  )
}
