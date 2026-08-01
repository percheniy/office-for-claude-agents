/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import type { OfficeState } from '../../office/engine/officeState.js'
import type { AgentStats, AgentRoleInfo, SubagentCharacter } from '../../hooks/useExtensionMessages.js'
import type { ToolActivity } from '../../office/types.js'
import { RoleBadge } from '../RoleBadge.js'
import { TokenBar } from '../TokenBar.js'
import { getContextLimit } from '../../modelInfo.js'

// ── Helpers ──────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.floor((ms % 60_000) / 1000)
  return `${mins}m ${secs}s`
}

export function getStatusLabel(
  agentId: number,
  agentTools: Record<number, ToolActivity[]>,
  agentStatuses: Record<number, string>,
  isActive: boolean,
): string {
  const status = agentStatuses[agentId]
  if (status === 'waiting') return 'Waiting for input'
  const tools = agentTools[agentId]
  if (tools && tools.length > 0) {
    const activeTool = [...tools].reverse().find((t) => !t.done)
    if (activeTool) {
      if (activeTool.permissionWait) return 'Needs approval'
      return activeTool.status
    }
    if (isActive) {
      const lastTool = tools[tools.length - 1]
      if (lastTool) return lastTool.status
    }
  }
  return 'Idle'
}

/** Status label with agent type hint for idle/waiting states */
function getStatusLabelWithType(
  agentId: number,
  agentTools: Record<number, ToolActivity[]>,
  agentStatuses: Record<number, string>,
  isActive: boolean,
  agentTeamInfo: Map<number, { teamName?: string; isTeamLead?: boolean }>,
  isSubagent: boolean,
): string {
  const base = getStatusLabel(agentId, agentTools, agentStatuses, isActive)
  if (base !== 'Waiting for input' && base !== 'Idle') return base
  const ti = agentTeamInfo.get(agentId)
  if (ti?.isTeamLead) return base
  if (ti?.teamName) return `teammate · ${base}`
  if (isSubagent) return `subagent · ${base}`
  return base
}

export function getSubagentActivity(
  parentAgentId: number,
  parentToolId: string,
  subagentTools: Record<number, Record<string, ToolActivity[]>>,
  officeState: OfficeState,
  subId?: number,
  agentTools?: Record<number, ToolActivity[]>,
  agentStatuses?: Record<number, string>,
): string {
  if (subId != null && parentToolId === '' && agentTools && agentStatuses) {
    const ch = officeState.characters.get(subId)
    if (ch?.bubbleType === 'permission') return 'Needs approval'
    return getStatusLabel(subId, agentTools, agentStatuses, ch?.isActive ?? false)
  }
  const resolvedSubId = officeState.getSubagentId(parentAgentId, parentToolId)
  const ch = resolvedSubId !== null ? officeState.characters.get(resolvedSubId) : null
  if (ch?.bubbleType === 'permission') return 'Needs approval'
  const agentSubs = subagentTools[parentAgentId]
  if (agentSubs) {
    const tools = agentSubs[parentToolId]
    if (tools && tools.length > 0) {
      const activeTool = [...tools].reverse().find((t) => !t.done)
      if (activeTool) {
        if (activeTool.permissionWait) return 'Needs approval'
        return activeTool.status
      }
      if (ch?.isActive) return 'Thinking'
      return 'Idle'
    }
  }
  if (ch?.isActive) return 'Working'
  return 'Idle'
}

// ── AgentCard ────────────────────────────────────────────────────────

export interface AgentCardProps {
  id: number
  agentTools: Record<number, ToolActivity[]>
  agentStatuses: Record<number, string>
  agentStats: Map<number, AgentStats>
  agentRoles: Map<number, AgentRoleInfo>
  agentTeamInfo: Map<number, { teamName?: string; isTeamLead?: boolean }>
  agentProvider: string
  subagentCharacters: SubagentCharacter[]
  subsByParent: Map<number, SubagentCharacter[]>
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  officeState: OfficeState
  onInspectAgent: (id: number) => void
}

export function AgentCard({
  id,
  agentTools,
  agentStatuses,
  agentStats,
  agentRoles,
  agentTeamInfo,
  agentProvider,
  subagentCharacters: _subagentCharacters,
  subsByParent,
  subagentTools,
  officeState,
  onInspectAgent,
}: AgentCardProps) {
  const ch = officeState.characters.get(id)
  if (!ch) return null

  const stats = agentStats.get(id)
  const roleInfo = agentRoles.get(id)
  const isActive = ch.isActive
  const tools = agentTools[id]
  const hasPermission = tools?.some((t) => t.permissionWait && !t.done)
  const hasActiveTools = tools?.some((t) => !t.done)
  const statusLabel = getStatusLabelWithType(id, agentTools, agentStatuses, isActive, agentTeamInfo, ch.isSubagent)
  const totalTokens = stats ? stats.totalInputTokens + stats.totalOutputTokens : 0
  const contextTokens = stats?.currentContextTokens ?? totalTokens
  const contextLimit = stats?.currentContextLimit ?? (stats ? getContextLimit(stats.model) : 0)
  const subs = subsByParent.get(id) || []

  let dotColor: string | null = null
  if (hasPermission) dotColor = 'var(--pixel-status-permission)'
  else if (isActive && hasActiveTools) dotColor = 'var(--pixel-status-active)'

  return (
    <div className="mb-[3px]">
      <div
        onClick={() => onInspectAgent(id)}
        className="px-2 py-1.5 border-2 cursor-pointer transition-colors duration-150 hover:bg-white/[0.06] bg-white/[0.02]"
        style={{ borderColor: hasPermission ? 'var(--pixel-status-permission)' : isActive && hasActiveTools ? 'rgba(90,140,255,0.3)' : 'transparent' }}
      >
        <div className="flex items-center gap-1 mb-[3px]">
          {dotColor && (
            <span className={`size-1.5 rounded-full shrink-0 ${isActive && !hasPermission ? 'pixel-agents-pulse' : ''}`}
              style={{ background: dotColor }} />
          )}
          <span className="text-[18px] text-pixel-text font-bold overflow-hidden text-ellipsis whitespace-nowrap flex-1">
            {ch.folderName || `agent-${id}`}
          </span>
          <span className="text-[10px] px-1 font-bold uppercase tracking-[0.4px] leading-[14px] bg-white/[0.08] text-white/60 border border-white/[0.15]">
            {agentProvider}
          </span>
          {roleInfo?.role && <span className="ml-auto"><RoleBadge role={roleInfo.role} colors={roleInfo.colors} /></span>}
        </div>
        <div className="text-[14px] overflow-hidden text-ellipsis whitespace-nowrap mb-[3px]"
          style={{ color: hasPermission ? 'var(--pixel-status-permission)' : isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)' }}>
          {statusLabel}
        </div>
        {stats && (
          <>
            <div className="flex items-center gap-1.5">
              <TokenBar totalTokens={totalTokens} usageTokens={contextTokens} contextLimit={contextLimit} model={stats.model} turnCount={stats.turnCount} visible={true} />
              <span className="text-[14px] text-white/35 font-mono whitespace-nowrap">{formatNumber(contextTokens)} tok</span>
            </div>
            <div className="flex gap-2 mt-0.5 text-[14px] text-white/30 font-mono">
              <span>{stats.turnCount} turns</span>
              <span>{formatDuration(stats.totalDurationMs)}</span>
              <span>cache {stats.cacheHitRate}%</span>
            </div>
          </>
        )}
      </div>
      {/* Subagents */}
      {subs.length > 0 && (
        <div className="ml-3 border-l-2 border-white/[0.08] pl-1.5">
          {subs.map((sub) => {
            const subCh = officeState.characters.get(sub.id)
            const subRole = agentRoles.get(sub.id)
            const subName = subCh?.folderName || sub.label || `subagent-${sub.id}`
            const subHasPermission = subCh?.bubbleType === 'permission'
            const subIsActive = subCh?.isActive ?? false
            const subActivityRaw = getSubagentActivity(sub.parentAgentId, sub.parentToolId, subagentTools, officeState, sub.id, agentTools, agentStatuses)
            const subTi = agentTeamInfo.get(sub.id)
            const subTypeLabel = subTi?.isTeamLead ? 'lead' : subTi?.teamName ? 'teammate' : 'subagent'
            const subActivity = subActivityRaw === 'Waiting for input' || subActivityRaw === 'Idle'
              ? `${subTypeLabel} · ${subActivityRaw}` : subActivityRaw
            let subDotColor: string | null = null
            if (subHasPermission) subDotColor = 'var(--pixel-status-permission)'
            else if (subIsActive) subDotColor = 'var(--pixel-status-active)'
            return (
              <div key={sub.id}
                className="px-1.5 py-1 mt-0.5 border transition-colors duration-150 hover:bg-white/[0.05]"
                style={{ borderColor: subHasPermission ? 'var(--pixel-status-permission)' : 'transparent' }}>
                <div className="flex items-center gap-1 mb-0.5">
                  {subDotColor && <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${subIsActive && !subHasPermission ? 'pixel-agents-pulse' : ''}`} style={{ background: subDotColor }} />}
                  <span className="text-[14px] text-pixel-text font-bold overflow-hidden text-ellipsis whitespace-nowrap flex-1">{subName}</span>
                  <span className="ml-auto">
                    {subRole?.role
                      ? <RoleBadge role={subRole.role} colors={subRole.colors} />
                      : (() => {
                          const ti = agentTeamInfo.get(sub.id)
                          const badgeLabel = ti?.isTeamLead ? 'lead' : ti?.teamName ? 'teammate' : (sub.label || 'subtask')
                          const badgeBg = ti?.isTeamLead ? 'rgba(255,200,60,0.15)' : ti?.teamName ? 'rgba(90,200,140,0.15)' : 'rgba(120,160,255,0.15)'
                          const badgeColor = ti?.isTeamLead ? 'rgba(255,200,60,0.9)' : ti?.teamName ? 'rgba(90,200,140,0.9)' : 'rgba(120,160,255,0.9)'
                          const badgeBorder = ti?.isTeamLead ? 'rgba(255,200,60,0.3)' : ti?.teamName ? 'rgba(90,200,140,0.3)' : 'rgba(120,160,255,0.3)'
                          return <span className="text-[11px] px-1 font-bold tracking-[0.5px] whitespace-nowrap leading-[16px]" style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}` }}>{badgeLabel}</span>
                        })()}
                  </span>
                </div>
                <div className="text-[14px] overflow-hidden text-ellipsis whitespace-nowrap" style={{ color: subHasPermission ? 'var(--pixel-status-permission)' : subIsActive ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)' }}>{subActivity}</div>
                {(() => {
                  const subStats = agentStats.get(sub.id)
                  if (!subStats) return null
                  const subTotalTokens = subStats.totalInputTokens + subStats.totalOutputTokens
                  const subContextTokens = subStats.currentContextTokens ?? subTotalTokens
                  const subContextLimit = subStats.currentContextLimit ?? getContextLimit(subStats.model)
                  if (subTotalTokens === 0) return null
                  return (
                    <>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <TokenBar totalTokens={subTotalTokens} usageTokens={subContextTokens} contextLimit={subContextLimit} model={subStats.model} turnCount={subStats.turnCount} visible={true} />
                        <span className="text-[12px] text-white/25 font-mono whitespace-nowrap">{formatNumber(subContextTokens)} tok</span>
                      </div>
                      <div className="flex gap-1.5 mt-px text-[12px] text-white/20 font-mono">
                        <span>{subStats.turnCount} turns</span>
                        <span>{formatDuration(subStats.totalDurationMs)}</span>
                      </div>
                    </>
                  )
                })()}
                {/* Level 3: sub-subagents */}
                {(() => {
                  const subSubs = subsByParent.get(sub.id) || []
                  if (subSubs.length === 0) return null
                  return (
                    <div className="ml-2.5 border-l-2 border-white/[0.05] pl-1 mt-0.5">
                      {subSubs.map((ss) => {
                        const ssCh = officeState.characters.get(ss.id)
                        const ssRole = agentRoles.get(ss.id)
                        const ssName = ssCh?.folderName || ss.label || `sub-${ss.id}`
                        const ssStats = agentStats.get(ss.id)
                        const ssTotalTokens = ssStats ? ssStats.totalInputTokens + ssStats.totalOutputTokens : 0
                        const ssContextTokens = ssStats?.currentContextTokens ?? ssTotalTokens
                        const ssContextLimit = ssStats?.currentContextLimit ?? (ssStats ? getContextLimit(ssStats.model) : 0)
                        const deepSubs = subsByParent.get(ss.id) || []
                        return (
                          <div key={ss.id} className="px-1 py-0.5 text-[12px]">
                            <div className="flex items-center gap-1">
                              <span className="text-white/40 overflow-hidden text-ellipsis whitespace-nowrap flex-1">{ssName}</span>
                              {ssRole?.role && <span className="ml-auto"><RoleBadge role={ssRole.role} colors={ssRole.colors} /></span>}
                            </div>
                            {ssStats && ssTotalTokens > 0 && (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <TokenBar totalTokens={ssTotalTokens} usageTokens={ssContextTokens} contextLimit={ssContextLimit} model={ssStats.model} turnCount={ssStats.turnCount} visible={true} />
                                <span className="text-[11px] text-white/20 font-mono whitespace-nowrap">{formatNumber(ssContextTokens)} tok</span>
                              </div>
                            )}
                            {/* Level 4+: deeper subagents */}
                            {deepSubs.length > 0 && (
                              <div className="ml-2.5 border-l-2 border-white/[0.03] pl-1 mt-0.5">
                                {deepSubs.map((ds) => {
                                  const dsCh = officeState.characters.get(ds.id)
                                  const dsRole = agentRoles.get(ds.id)
                                  const dsName = dsCh?.folderName || ds.label || `sub-${ds.id}`
                                  const dsStats = agentStats.get(ds.id)
                                  const dsTotalTokens = dsStats ? dsStats.totalInputTokens + dsStats.totalOutputTokens : 0
                                  const dsContextTokens = dsStats?.currentContextTokens ?? dsTotalTokens
                                  const dsContextLimit = dsStats?.currentContextLimit ?? (dsStats ? getContextLimit(dsStats.model) : 0)
                                  return (
                                    <div key={ds.id} className="px-1 py-0.5 text-[11px]">
                                      <div className="flex items-center gap-1">
                                        <span className="text-white/30 overflow-hidden text-ellipsis whitespace-nowrap flex-1">{dsName}</span>
                                        {dsRole?.role && <span className="ml-auto"><RoleBadge role={dsRole.role} colors={dsRole.colors} /></span>}
                                      </div>
                                      {dsStats && dsTotalTokens > 0 && (
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                          <TokenBar totalTokens={dsTotalTokens} usageTokens={dsContextTokens} contextLimit={dsContextLimit} model={dsStats.model} turnCount={dsStats.turnCount} visible={true} />
                                          <span className="text-[11px] text-white/20 font-mono whitespace-nowrap">{formatNumber(dsContextTokens)} tok</span>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
