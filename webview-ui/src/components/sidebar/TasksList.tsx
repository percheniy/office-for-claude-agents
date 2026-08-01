/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import type { GateStatus, GithubTasksConfig, PipelineIssue } from '../../hooks/useExtensionMessages.js'

function getIssueLabelColor(label: string): string {
  const normalized = label.toLowerCase()
  if (normalized.includes('bug') || normalized.includes('blocked')) return '#e55'
  if (normalized.includes('feature') || normalized.includes('enhancement')) return '#3794ff'
  if (normalized.includes('high') || normalized.includes('urgent')) return '#f90'
  if (normalized.includes('done') || normalized.includes('fixed') || normalized.includes('release')) return '#5ac88c'
  return 'rgba(255,255,255,0.4)'
}

function getPipelineStateColor(state: string): string {
  switch (state) {
    case 'done': return '#5ac88c'
    case 'in_progress': return '#3794ff'
    case 'ready': return '#5ac88c'
    case 'review_ready': case 'merge_ready': return '#a78bfa'
    case 'blocked': return '#e55'
    case 'todo': return '#fc0'
    case 'intake_required': return '#f90'
    default: return 'rgba(255,255,255,0.4)'
  }
}

function getPipelineStateLabel(state: string): string {
  return state.replace(/_/g, ' ')
}

const PIPELINE_GATES = [
  { gate: 5, label: 'DOC' },
  { gate: 8, label: 'PLN' },
  { gate: 11, label: 'REV' },
  { gate: 12, label: 'VAL' },
  { gate: 13, label: 'VIS' },
  { gate: 15, label: 'MRG' },
] as const

function getPipelineProgress(state: string): number {
  if (!state) return 0
  if (state === 'done') return 100
  if (state === 'blocked') return -1
  if (state === 'intake_required' || state === 'todo') return 0
  const linear = ['ready', 'in_progress', 'review_ready', 'merge_ready', 'done']
  const li = linear.indexOf(state)
  if (li < 0) return 0
  return Math.round((li / (linear.length - 1)) * 100)
}

export interface TasksListProps {
  githubTasks: GithubTasksConfig
  pipelineIssues: PipelineIssue[]
  tasksCollapsed: boolean
  onToggleTasksCollapse: () => void
}

export function TasksList({
  githubTasks,
  pipelineIssues,
  tasksCollapsed,
  onToggleTasksCollapse,
}: TasksListProps) {
  return (
    <div
      className="border-t-2 border-pixel-border bg-white/[0.03] min-h-0 flex flex-col"
      style={{
        flex: tasksCollapsed ? '0 0 auto' : '1 1 0',
        overflowY: tasksCollapsed ? 'hidden' : 'auto',
      }}
    >
      <div onClick={onToggleTasksCollapse} className="flex items-center gap-1 px-2 py-1.5 cursor-pointer shrink-0">
        <span className="text-[14px] text-[#ff9f43] font-bold uppercase tracking-[0.5px] flex-1">
          TASKS ({pipelineIssues.length})
        </span>
        <span className="text-[14px] text-pixel-text-dim">
          {tasksCollapsed ? '\u25B2' : '\u25BC'}
        </span>
      </div>

      {!tasksCollapsed && (
        <div className="overflow-y-auto px-2 pb-1.5 flex-1 min-h-0">
          {pipelineIssues.length === 0 ? (
            <div className="text-[14px] text-white/30 italic">
              {githubTasks.enabled
                ? 'No GitHub issues found, or GitHub CLI is not configured.'
                : 'GitHub tasks are disabled in ~/.pixel-agents/config.json.'}
            </div>
          ) : (
            pipelineIssues.map((issue) => (
              <div key={`bottom-${issue.repo}-${issue.number}`} className="px-2 py-1.5 mb-[3px] bg-white/[0.02] border-2 border-white/[0.05]">
                <div className="flex items-center gap-1 mb-[3px]">
                  <span className="text-[14px] text-pixel-accent font-bold shrink-0">#{issue.number}</span>
                  <span className="text-[14px] text-white/30 shrink-0">{issue.repo}</span>
                  {issue.pipelineState && (() => {
                    const stateConfig = githubTasks.pipeline.states.find((s) => s.id === issue.pipelineState)
                    const color = stateConfig?.color || getPipelineStateColor(issue.pipelineState)
                    return (
                      <span
                        className="text-[12px] px-[5px] py-px ml-auto whitespace-nowrap font-bold uppercase tracking-[0.3px]"
                        style={{
                          background: `${color}22`,
                          color,
                          border: `1px solid ${color}44`,
                        }}
                      >
                        {stateConfig?.label || getPipelineStateLabel(issue.pipelineState)}
                      </span>
                    )
                  })()}
                </div>
                <div className="text-[14px] text-pixel-text overflow-hidden text-ellipsis whitespace-nowrap mb-[3px]">
                  {issue.title}
                </div>
                {issue.labels.length > 0 && (
                  <div className="flex gap-[3px] flex-wrap">
                    {issue.labels.map((label) => {
                      const c = getIssueLabelColor(label)
                      return (
                        <span key={label} className="text-[14px] px-1 py-px whitespace-nowrap" style={{
                          background: `${c}22`, color: c, border: `1px solid ${c}44`,
                        }}>
                          {label}
                        </span>
                      )
                    })}
                  </div>
                )}
                {issue.pipelineState && (() => {
                  const gates = issue.gates || []
                  const hasGateData = gates.length > 0
                  const configuredState = githubTasks.pipeline.states.find((s) => s.id === issue.pipelineState)
                  const stateColor = configuredState?.color || getPipelineStateColor(issue.pipelineState)
                  const configuredGates = githubTasks.pipeline.gates.length > 0 ? githubTasks.pipeline.gates : PIPELINE_GATES

                  if (hasGateData) {
                    const passCount = gates.filter((g: GateStatus) => g.status === 'pass').length
                    return (
                      <div className="mt-1">
                        <div className="flex gap-0.5">
                          {configuredGates.map(({ gate, label }) => {
                            const entry = gates.find((g: GateStatus) => g.gate === gate)
                            const s = entry?.status
                            const color = s === 'pass' ? '#5ac88c' : s === 'fail' ? '#e55' : 'rgba(255,255,255,0.08)'
                            return (
                              <div key={gate} className="flex-1 text-center">
                                <div
                                  className="h-1.5 border border-white/10 [image-rendering:pixelated]"
                                  style={{
                                    background: s === 'fail'
                                      ? 'repeating-linear-gradient(45deg, #e55, #e55 2px, #a33 2px, #a33 4px)'
                                      : color,
                                  }}
                                  title={entry?.comment || label}
                                />
                                <div className="text-[8px] font-mono mt-px" style={{
                                  color: s === 'pass' ? '#5ac88c' : s === 'fail' ? '#e55' : 'rgba(255,255,255,0.15)',
                                  letterSpacing: -0.5,
                                }}>{label}</div>
                              </div>
                            )
                          })}
                        </div>
                        <div className="text-[12px] text-white/40 font-mono text-right mt-0.5">
                          {passCount}/{configuredGates.length}
                        </div>
                      </div>
                    )
                  }

                  const pct = githubTasks.pipeline.states.length > 0
                    ? (() => {
                        if (issue.pipelineState === 'blocked') return -1
                        if (issue.pipelineState === 'done') return 100
                        const states = githubTasks.pipeline.states
                        const idx = states.findIndex((s) => s.id === issue.pipelineState)
                        return idx < 0 ? 0 : Math.round((idx / Math.max(states.length - 1, 1)) * 100)
                      })()
                    : getPipelineProgress(issue.pipelineState)
                  const isBlocked = pct === -1
                  const barColor = isBlocked ? '#e55' : stateColor
                  const displayPct = isBlocked ? 100 : pct
                  return (
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="flex-1 h-1.5 bg-white/[0.08] border border-white/10 overflow-hidden [image-rendering:pixelated]">
                        <div
                          className="h-full transition-[width] duration-300 [image-rendering:pixelated]"
                          style={{
                            width: `${displayPct}%`,
                            background: isBlocked
                              ? 'repeating-linear-gradient(45deg, #e55, #e55 3px, #a33 3px, #a33 6px)'
                              : barColor,
                          }}
                        />
                      </div>
                      <span className="text-[14px] font-mono font-bold shrink-0 min-w-[32px] text-right" style={{ color: barColor }}>
                        {isBlocked ? 'BLK' : `${pct}%`}
                      </span>
                    </div>
                  )
                })()}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
