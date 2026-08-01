import { TILE_SIZE, CharacterState } from '../../types.js'
import type { Character } from '../../types.js'
import { getCachedSprite } from '../../sprites/spriteCache.js'
import { BUBBLE_PERMISSION_SPRITE, BUBBLE_WAITING_SPRITE } from '../../sprites/spriteData.js'
import {
  ACTIVITY_BUBBLE_FADE_SEC,
  BUBBLE_FADE_DURATION_SEC,
  BUBBLE_SITTING_OFFSET_PX,
  BUBBLE_VERTICAL_OFFSET_PX,
} from '../../../constants.js'

export function renderBubbles(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  for (const ch of characters) {
    if (!ch.bubbleType) continue

    const sittingOff = ch.state === CharacterState.TYPE ? BUBBLE_SITTING_OFFSET_PX : 0

    // ── Activity bubble: square box with dynamic text (2 lines, 150px wide), above nameplate ──
    if (ch.bubbleType === 'activity') {
      let alpha = 1.0
      if (ch.bubbleTimer < ACTIVITY_BUBBLE_FADE_SEC) {
        alpha = Math.max(0, ch.bubbleTimer / ACTIVITY_BUBBLE_FADE_SEC)
      }
      if (alpha <= 0) continue

      const fontSize = 20
      ctx.save()
      ctx.font = `${fontSize}px "FS Pixel Sans", sans-serif`
      const text = ch.bubbleText || ''

      // Word-wrap into 2 lines, max 150px wide
      const maxW = 150
      const words = text.split(/\s+/)
      let line1 = ''
      let line2 = ''
      for (const word of words) {
        const test = line1 ? line1 + ' ' + word : word
        if (ctx.measureText(test).width <= maxW) {
          line1 = test
        } else {
          if (!line2) {
            line2 = word
          } else {
            const test2 = line2 + ' ' + word
            if (ctx.measureText(test2).width <= maxW) {
              line2 = test2
            } else {
              line2 = line2 + ' ' + word
              break
            }
          }
        }
      }
      // Truncate line2 if too wide
      if (line2 && ctx.measureText(line2).width > maxW) {
        while (ctx.measureText(line2 + '\u2026').width > maxW && line2.length > 1) {
          line2 = line2.slice(0, -1)
        }
        line2 = line2 + '\u2026'
      }

      const lines = line2 ? [line1, line2] : [line1]
      const lineH = fontSize + 2
      const padX = 6
      const padY = 4
      const boxW = maxW + padX * 2
      const boxH = lineH * lines.length + padY * 2
      const tailH = 0

      // Position: bubble bottom edge touches nameplate top edge
      // ToolOverlay nameplate top (in device px) = offsetY + (ch.y+sit-32)*zoom - 24*dpr
      const dpr = window.devicePixelRatio || 1
      const nameplateTop = offsetY + (ch.y + sittingOff - 32) * zoom - 24 * dpr
      const boxY = Math.round(nameplateTop - boxH - 16 * dpr)
      const cx = Math.round(offsetX + ch.x * zoom)
      const boxX = cx - Math.round(boxW / 2)

      // Box background
      ctx.globalAlpha = alpha * 0.9
      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(boxX, boxY, boxW, boxH)
      ctx.strokeStyle = '#555577'
      ctx.lineWidth = 1
      ctx.strokeRect(boxX, boxY, boxW, boxH)

      // Tail pointer
      ctx.fillStyle = '#1a1a2e'
      ctx.beginPath()
      ctx.moveTo(cx - 3, boxY + boxH)
      ctx.lineTo(cx + 3, boxY + boxH)
      ctx.lineTo(cx, boxY + boxH + tailH)
      ctx.closePath()
      ctx.fill()

      // Text lines
      ctx.globalAlpha = alpha
      ctx.fillStyle = '#ccddff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], cx, boxY + padY + i * lineH)
      }
      ctx.restore()
      continue
    }

    // ── Permission / waiting sprite bubbles ──
    const sprite = ch.bubbleType === 'permission'
      ? BUBBLE_PERMISSION_SPRITE
      : BUBBLE_WAITING_SPRITE

    let alpha = 1.0
    if (ch.bubbleType === 'waiting' && ch.bubbleTimer < BUBBLE_FADE_DURATION_SEC) {
      alpha = ch.bubbleTimer / BUBBLE_FADE_DURATION_SEC
    }

    const cached = getCachedSprite(sprite, zoom)
    const bubbleX = Math.round(offsetX + ch.x * zoom - cached.width / 2)
    const bubbleY = Math.round(offsetY + (ch.y + sittingOff - BUBBLE_VERTICAL_OFFSET_PX) * zoom - cached.height - 1 * zoom)

    ctx.save()
    if (alpha < 1.0) ctx.globalAlpha = alpha
    ctx.drawImage(cached, bubbleX, bubbleY)
    ctx.restore()
  }
}

/** Compute convex hull of 2D points (Andrew's monotone chain) */
function convexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= 1) return points
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Array<{ x: number; y: number }> = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Array<{ x: number; y: number }> = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

export function renderTeamLines(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  // Build parent -> children map
  const childMap = new Map<number, number[]>()
  for (const ch of characters) {
    if (ch.parentAgentId != null && !ch.matrixEffect) {
      const siblings = childMap.get(ch.parentAgentId) || []
      siblings.push(ch.id)
      childMap.set(ch.parentAgentId, siblings)
    }
  }
  const charById = new Map<number, Character>()
  for (const ch of characters) charById.set(ch.id, ch)

  // Find the team lead: walk up parentAgentId chain to the topmost ancestor
  const findTeamLead = (id: number): number => {
    const seen = new Set<number>()
    let cur = id
    while (true) {
      seen.add(cur)
      const ch = charById.get(cur)
      if (!ch || ch.parentAgentId == null || seen.has(ch.parentAgentId)) return cur
      cur = ch.parentAgentId
    }
  }

  // Collect all descendants of a given root (including root itself)
  const collectDescendants = (rootId: number): number[] => {
    const result: number[] = []
    const visited = new Set<number>()
    const stack = [rootId]
    while (stack.length > 0) {
      const cur = stack.pop()!
      if (visited.has(cur)) continue
      visited.add(cur)
      result.push(cur)
      const children = childMap.get(cur)
      if (children) {
        for (const childId of children) stack.push(childId)
      }
    }
    return result
  }

  // Group all agents by team lead
  const teamsByLead = new Map<number, number[]>()
  const visitedLeads = new Set<number>()
  for (const [parentId] of childMap) {
    const leadId = findTeamLead(parentId)
    if (visitedLeads.has(leadId)) continue
    visitedLeads.add(leadId)
    teamsByLead.set(leadId, collectDescendants(leadId))
  }

  // Solo agents (no parent, no children) are their own team of one
  const assignedIds = new Set<number>()
  for (const members of teamsByLead.values()) {
    for (const id of members) assignedIds.add(id)
  }
  for (const ch of characters) {
    if (ch.matrixEffect || ch.leavingOffice) continue
    if (!assignedIds.has(ch.id)) {
      teamsByLead.set(ch.id, [ch.id])
    }
  }

  const teamColors = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#dcbeff', '#9a6324', '#00b4d8']
  let colorIdx = 0
  const leadColorMap = new Map<number, string>()

  // Pass 1: Draw cluster areas as tile-based squares with solid perimeter border
  const ts = TILE_SIZE * zoom // tile size in screen pixels
  ctx.save()

  // Helper: check if tile (col,row) is inside a convex hull of tile-coordinate points
  const isInsideTileHull = (col: number, row: number, hull: Array<{ x: number; y: number }>): boolean => {
    const px = col + 0.5, py = row + 0.5 // tile center
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i], b = hull[(i + 1) % hull.length]
      if ((b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x) < 0) return false
    }
    return true
  }

  for (const [leadId, members] of teamsByLead) {
    if (!leadColorMap.has(leadId)) {
      leadColorMap.set(leadId, teamColors[colorIdx % teamColors.length])
      colorIdx++
    }
    const color = leadColorMap.get(leadId)!

    // Collect member tile positions
    const memberTiles: Array<{ col: number; row: number }> = []
    for (const memberId of members) {
      const ch = charById.get(memberId)
      if (!ch || ch.matrixEffect) continue
      memberTiles.push({ col: ch.tileCol, row: ch.tileRow })
    }
    if (memberTiles.length === 0) continue

    const PAD = 1 // tile padding around cluster
    const tileSet = new Set<string>()
    const tileList: Array<{ col: number; row: number }> = []

    if (memberTiles.length === 1) {
      // Single agent — 3x3 square
      const t = memberTiles[0]
      for (let dc = -PAD; dc <= PAD; dc++) {
        for (let dr = -PAD; dr <= PAD; dr++) {
          const key = `${t.col + dc},${t.row + dr}`
          if (!tileSet.has(key)) { tileSet.add(key); tileList.push({ col: t.col + dc, row: t.row + dr }) }
        }
      }
    } else {
      // Multiple agents — fill all tiles inside the convex hull of member positions (with padding)
      // Expand member positions outward by PAD tiles for hull computation
      const expandedPts = memberTiles.flatMap(t => {
        const pts: Array<{ x: number; y: number }> = []
        for (let dc = -PAD; dc <= PAD; dc++) {
          for (let dr = -PAD; dr <= PAD; dr++) {
            pts.push({ x: t.col + dc, y: t.row + dr })
          }
        }
        return pts
      })
      const hull = convexHull(expandedPts)

      // Compute bounding box of hull
      let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity
      for (const p of hull) {
        if (p.x < minC) minC = p.x; if (p.x > maxC) maxC = p.x
        if (p.y < minR) minR = p.y; if (p.y > maxR) maxR = p.y
      }
      minC = Math.floor(minC); maxC = Math.ceil(maxC)
      minR = Math.floor(minR); maxR = Math.ceil(maxR)

      // Fill all tiles inside the hull
      for (let c = minC; c <= maxC; c++) {
        for (let r = minR; r <= maxR; r++) {
          if (isInsideTileHull(c, r, hull)) {
            const key = `${c},${r}`
            if (!tileSet.has(key)) { tileSet.add(key); tileList.push({ col: c, row: r }) }
          }
        }
      }
    }

    if (tileList.length === 0) continue

    // Fill tiles with team color
    ctx.globalAlpha = 0.18
    ctx.fillStyle = color
    for (const t of tileList) {
      const sx = offsetX + t.col * ts
      const sy = offsetY + t.row * ts
      ctx.fillRect(Math.round(sx), Math.round(sy), Math.ceil(ts), Math.ceil(ts))
    }

    // Draw solid thick border on outer perimeter edges
    ctx.globalAlpha = 1.0
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(2, Math.round(zoom * 1.5))
    ctx.setLineDash([])
    ctx.beginPath()
    for (const t of tileList) {
      const sx = Math.round(offsetX + t.col * ts)
      const sy = Math.round(offsetY + t.row * ts)
      const w = Math.ceil(ts)
      const h = Math.ceil(ts)
      // Top edge — no neighbor above
      if (!tileSet.has(`${t.col},${t.row - 1}`)) {
        ctx.moveTo(sx, sy); ctx.lineTo(sx + w, sy)
      }
      // Bottom edge — no neighbor below
      if (!tileSet.has(`${t.col},${t.row + 1}`)) {
        ctx.moveTo(sx, sy + h); ctx.lineTo(sx + w, sy + h)
      }
      // Left edge — no neighbor left
      if (!tileSet.has(`${t.col - 1},${t.row}`)) {
        ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + h)
      }
      // Right edge — no neighbor right
      if (!tileSet.has(`${t.col + 1},${t.row}`)) {
        ctx.moveTo(sx + w, sy); ctx.lineTo(sx + w, sy + h)
      }
    }
    ctx.stroke()

    // Draw cluster number in the center
    let sumX = 0, sumY = 0
    for (const t of tileList) {
      sumX += offsetX + (t.col + 0.5) * ts
      sumY += offsetY + (t.row + 0.5) * ts
    }
    const cx = sumX / tileList.length
    const cy = sumY / tileList.length
    const fontSize = Math.max(12, Math.round(ts * 1.2))
    ctx.globalAlpha = 0.85
    ctx.font = `bold ${fontSize}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // Dark outline for readability
    ctx.strokeStyle = '#000'
    ctx.lineWidth = Math.max(2, Math.round(zoom * 2))
    ctx.strokeText(`${colorIdx}`, Math.round(cx), Math.round(cy))
    ctx.fillStyle = color
    ctx.fillText(`${colorIdx}`, Math.round(cx), Math.round(cy))
  }

  ctx.restore()
}
