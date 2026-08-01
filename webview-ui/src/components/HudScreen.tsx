import { useState, useMemo } from 'react'
import type { AgentStats, AgentRoleInfo } from '../hooks/useExtensionMessages.js'
import { getModelInfo } from '../modelInfo.js'

interface HudScreenProps {
  isOpen: boolean
  onClose: () => void
  agents: Map<number, { name: string; status: string }>
  agentStats: Map<number, AgentStats>
  agentRoles: Map<number, AgentRoleInfo>
}

type SortKey = 'id' | 'role' | 'model' | 'input' | 'output' | 'cache' | 'context' | 'turns' | 'duration'
type SortDir = 'asc' | 'desc'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

function formatCost(dollars: number): string {
  if (dollars >= 1) return `$${dollars.toFixed(2)}`
  if (dollars >= 0.01) return `$${dollars.toFixed(3)}`
  return `$${dollars.toFixed(4)}`
}

interface ModelPricing { inputPerMtok: number; outputPerMtok: number }

function getPricing(model?: string): ModelPricing | null {
  const m = (model ?? '').toLowerCase()
  if (m.includes('haiku')) return { inputPerMtok: 0.25, outputPerMtok: 1.25 }
  if (m.includes('sonnet')) return { inputPerMtok: 3, outputPerMtok: 15 }
  if (m.includes('opus')) return { inputPerMtok: 15, outputPerMtok: 75 }
  return null
}

function estimateCost(stats: AgentStats): number | null {
  const pricing = getPricing(stats.model)
  if (!pricing) return null
  const inputCost = ((stats.totalInputTokens - stats.totalCacheRead) / 1_000_000) * pricing.inputPerMtok
  const cacheCost = (stats.totalCacheRead / 1_000_000) * pricing.inputPerMtok * 0.1
  const outputCost = (stats.totalOutputTokens / 1_000_000) * pricing.outputPerMtok
  return Math.max(0, inputCost + cacheCost + outputCost)
}

function contextFillColor(pct: number): string {
  if (pct < 50) return '#4caf50'
  if (pct < 80) return '#ffc107'
  return '#f44336'
}

const thCls = "px-2 py-1.5 text-left border-b-2 border-pixel-border cursor-pointer select-none text-white/70 text-[13px] whitespace-nowrap"
const thRightCls = `${thCls} text-right`
const tdCls = "px-2 py-[5px] border-b border-white/[0.06] whitespace-nowrap"
const tdRightCls = `${tdCls} text-right`

export function HudScreen({ isOpen, onClose, agents, agentStats, agentRoles }: HudScreenProps) {
  const [sortKey, setSortKey] = useState<SortKey>('id')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const summary = useMemo(() => {
    let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalDuration = 0, totalCost = 0, pricedAgents = 0, cacheHitSum = 0, cacheHitCount = 0
    for (const stats of agentStats.values()) {
      totalInput += stats.totalInputTokens; totalOutput += stats.totalOutputTokens
      totalCacheRead += stats.totalCacheRead; totalDuration += stats.totalDurationMs
      const cost = estimateCost(stats)
      if (cost !== null) { totalCost += cost; pricedAgents++ }
      cacheHitSum += stats.cacheHitRate; cacheHitCount++
    }
    const totalTokens = totalInput + totalOutput + totalCacheRead
    const avgCacheHit = cacheHitCount > 0 ? cacheHitSum / cacheHitCount : 0
    const activeCount = [...agents.values()].filter((a) => a.status === 'active' || a.status === undefined).length
    const costLabel = pricedAgents === 0
      ? '—'
      : pricedAgents === agentStats.size
        ? formatCost(totalCost)
        : `${formatCost(totalCost)} partial`
    return { totalTokens, costLabel, totalDuration, activeCount, avgCacheHit }
  }, [agentStats, agents])

  const rows = useMemo(() => {
    const result: Array<{ id: number; name: string; role: string; model: string; input: number; output: number; cacheHit: number; contextPct: number; turns: number; durationMs: number }> = []
    for (const [id, agent] of agents) {
      const stats = agentStats.get(id)
      const roleInfo = agentRoles.get(id)
      const contextPct = stats?.currentContextLimit ? Math.min(((stats.currentContextTokens ?? 0) / stats.currentContextLimit) * 100, 100) : 0
      const modelInfo = getModelInfo(stats?.model)
      const model = modelInfo ? `${modelInfo.provider} · ${modelInfo.shortName}` : '-'
      result.push({ id, name: agent.name, role: roleInfo?.role ?? '-', model, input: stats?.totalInputTokens ?? 0, output: stats?.totalOutputTokens ?? 0, cacheHit: stats?.cacheHitRate ?? 0, contextPct, turns: stats?.turnCount ?? 0, durationMs: stats?.totalDurationMs ?? 0 })
    }
    result.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'id': cmp = a.id - b.id; break; case 'role': cmp = a.role.localeCompare(b.role); break
        case 'model': cmp = a.model.localeCompare(b.model); break; case 'input': cmp = a.input - b.input; break
        case 'output': cmp = a.output - b.output; break; case 'cache': cmp = a.cacheHit - b.cacheHit; break
        case 'context': cmp = a.contextPct - b.contextPct; break; case 'turns': cmp = a.turns - b.turns; break
        case 'duration': cmp = a.durationMs - b.durationMs; break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [agents, agentStats, agentRoles, sortKey, sortDir])

  const warnings = useMemo(() => {
    const lowCache: Array<{ id: number; name: string; rate: number }> = []
    const highContext: Array<{ id: number; name: string; pct: number }> = []
    for (const row of rows) {
      const stats = agentStats.get(row.id)
      if (stats && stats.cacheHitRate < 30 && stats.turnCount > 0) lowCache.push({ id: row.id, name: row.name, rate: row.cacheHit })
      if (row.contextPct > 80) highContext.push({ id: row.id, name: row.name, pct: row.contextPct })
    }
    return { lowCache, highContext }
  }, [rows, agentStats])

  if (!isOpen) return null

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  const sortIndicator = (key: SortKey) => sortKey !== key ? '' : sortDir === 'asc' ? ' ^' : ' v'
  const hasWarnings = warnings.lowCache.length > 0 || warnings.highContext.length > 0

  return (
    <div className="fixed inset-0 z-[200] bg-black/75 flex items-start justify-center overflow-y-auto px-4 py-10" onClick={onClose}>
      <div className="w-full max-w-[900px] bg-pixel-bg border-2 border-pixel-border shadow-pixel p-5 relative text-pixel-text text-[16px] font-mono [image-rendering:pixelated]" onClick={(e) => e.stopPropagation()}>
        <button
          className="absolute top-2 right-3 bg-transparent border-0 text-white/60 text-[20px] cursor-pointer px-1.5 py-0.5 leading-none hover:bg-pixel-btn hover:text-pixel-close-hover"
          onClick={onClose}
          title="Close HUD"
        >
          X
        </button>

        <div className="text-[20px] mb-3.5 text-white/90">HUD - Agent Metrics</div>

        {/* Summary Bar */}
        <div className="flex flex-wrap gap-4 px-3.5 py-2.5 mb-4 border-2 border-pixel-border bg-white/[0.03]">
          {[
            ['Total Tokens', formatTokens(summary.totalTokens)],
            ['Est. Cost', summary.costLabel],
            ['Total Duration', formatDuration(summary.totalDuration)],
            ['Active Agents', String(summary.activeCount)],
            ['Avg Cache Hit', `${Math.round(summary.avgCacheHit)}%`],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-[12px] text-pixel-text-dim uppercase tracking-[0.5px]">{label}</span>
              <span className="text-[20px] text-pixel-accent font-bold">{value}</span>
            </div>
          ))}
        </div>

        {/* Table */}
        {rows.length === 0 ? (
          <div className="py-5 text-center text-pixel-text-dim">No agent data available</div>
        ) : (
          <div className="overflow-x-auto mb-4">
            <table className="w-full [border-collapse:collapse] text-[14px]">
              <thead>
                <tr>
                  <th className={thCls} onClick={() => handleSort('id')}>ID{sortIndicator('id')}</th>
                  <th className={thCls} onClick={() => handleSort('role')}>Role{sortIndicator('role')}</th>
                  <th className={thCls} onClick={() => handleSort('model')}>Model{sortIndicator('model')}</th>
                  <th className={thRightCls} onClick={() => handleSort('input')}>Input{sortIndicator('input')}</th>
                  <th className={thRightCls} onClick={() => handleSort('output')}>Output{sortIndicator('output')}</th>
                  <th className={thRightCls} onClick={() => handleSort('cache')}>Cache %{sortIndicator('cache')}</th>
                  <th className={thRightCls} onClick={() => handleSort('context')}>Ctx %{sortIndicator('context')}</th>
                  <th className={thRightCls} onClick={() => handleSort('turns')}>Turns{sortIndicator('turns')}</th>
                  <th className={thRightCls} onClick={() => handleSort('duration')}>Duration{sortIndicator('duration')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className={tdCls}>{row.id}</td>
                    <td className={tdCls}>{row.role}</td>
                    <td className={tdCls}>{row.model}</td>
                    <td className={tdRightCls}>{formatTokens(row.input)}</td>
                    <td className={tdRightCls}>{formatTokens(row.output)}</td>
                    <td className={tdRightCls}>{Math.round(row.cacheHit)}%</td>
                    <td className={tdRightCls} style={{ color: contextFillColor(row.contextPct) }}>{Math.round(row.contextPct)}%</td>
                    <td className={tdRightCls}>{row.turns}</td>
                    <td className={tdRightCls}>{formatDuration(row.durationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Warnings */}
        {hasWarnings && (
          <div className="px-3.5 py-2.5 border-2 border-pixel-border bg-[rgba(244,67,54,0.08)]">
            <div className="text-[16px] text-[#f44336] mb-1.5 font-bold">Bottleneck Warnings</div>
            {warnings.lowCache.map((w) => (
              <div key={`cache-${w.id}`} className="text-[14px] text-white/75 py-0.5">
                Agent {w.id} ({w.name}): cache hit rate {Math.round(w.rate)}% — wasteful, consider prompt caching
              </div>
            ))}
            {warnings.highContext.map((w) => (
              <div key={`ctx-${w.id}`} className="text-[14px] text-white/75 py-0.5">
                Agent {w.id} ({w.name}): context fill {Math.round(w.pct)}% — near limit
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
