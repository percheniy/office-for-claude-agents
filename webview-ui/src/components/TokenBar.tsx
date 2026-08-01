/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { getModelInfo } from '../modelInfo.js'

interface TokenBarProps {
  totalTokens: number
  usageTokens?: number
  contextLimit: number
  model?: string
  turnCount: number
  visible: boolean
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function TokenBar({ totalTokens, usageTokens, contextLimit, model, turnCount, visible }: TokenBarProps) {
  if (!visible || contextLimit === 0) return null

  const contextTokens = usageTokens ?? totalTokens
  const pct = Math.min((contextTokens / contextLimit) * 100, 100)
  const modelInfo = getModelInfo(model)

  let barColor: string
  if (pct < 50) {
    barColor = '#4caf50'
  } else if (pct < 80) {
    barColor = '#ffc107'
  } else {
    barColor = '#f44336'
  }

  const tooltipText = `${modelInfo ? `${modelInfo.provider}: ${modelInfo.rawName} | ` : ''}${formatNumber(contextTokens)} / ${formatNumber(contextLimit)} tokens in context (${Math.round(pct)}%) | ${formatNumber(totalTokens)} total | ${turnCount} turns`

  return (
    <div className="flex items-center gap-1 mt-0.5">
      {modelInfo && (
        <span className="text-[10px] leading-none text-pixel-text-dim font-mono tracking-[0.5px] uppercase">
          {modelInfo.shortName}
        </span>
      )}
      <div
        title={tooltipText}
        className="w-16 h-[5px] bg-white/10 border border-white/15 overflow-hidden [image-rendering:pixelated] box-content"
      >
        <div
          className="h-full transition-[width] duration-300 ease-in-out [image-rendering:pixelated]"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
    </div>
  )
}
