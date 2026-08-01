import { TILE_SIZE, MATRIX_EFFECT_DURATION, CharacterState, Direction } from '../types.js'
import {
  AUTO_ON_FACING_DEPTH,
  AUTO_ON_SIDE_DEPTH,
  CHARACTER_HIT_HALF_WIDTH,
  CHARACTER_HIT_HEIGHT,
  CHARACTER_SITTING_OFFSET_PX,
  DISMISS_BUBBLE_FAST_FADE_SEC,
  FURNITURE_ANIM_INTERVAL_SEC,
  INACTIVE_SEAT_TIMER_MIN_SEC,
  INACTIVE_SEAT_TIMER_RANGE_SEC,
  WAITING_BUBBLE_DURATION_SEC,
  ACTIVITY_BUBBLE_DURATION_SEC,
  ACTIVITY_BUBBLE_MAX_CHARS,
} from '../../constants.js'
import type { Character, Seat, FurnitureInstance, TileType as TileTypeVal, OfficeLayout, PlacedFurniture } from '../types.js'
import { createCharacter, updateCharacter, findFreeCoffeeSpot, findFreeSmokingSpot } from './characters.js'
import { matrixEffectSeeds } from './matrixEffect.js'
import { isWalkable, getWalkableTiles, findPath } from '../layout/tileMap.js'
import {
  createDefaultLayout,
  layoutToTileMap,
  layoutToFurnitureInstances,
  layoutToSeats,
  getBlockedTiles,

  getSeatTiles,
} from '../layout/layoutSerializer.js'
import { getAnimationFrames, getCatalogEntry, getOnStateType, isDoorFurniture } from '../layout/furnitureCatalog.js'
import {
  getAgentPriority as _getAgentPriority,
  getClusterCentroid as _getClusterCentroid,
  snapToWalkable as _snapToWalkable,
  getWalkingDistance as _getWalkingDistance,
  scoreClusterSeat as _scoreClusterSeat,
  findFreeSeatNear as _findFreeSeatNear,
  getBfsDistanceMap as _getBfsDistanceMap,
  type ClusterState,
} from './teamClustering.js'
import {
  applySeatFacingOverrides,
  isSeatClaimed as _isSeatClaimed,
  claimSeat as _claimSeat,
  canSitInSeat as _canSitInSeat,
  isRoleSeatForAgent as _isRoleSeatForAgent,
  findFreeSeat as _findFreeSeat,
  pickDiversePalette as _pickDiversePalette,
} from './seatManager.js'
import {
  DOOR_BRIDGE_TILES,
  getEntranceTile as _getEntranceTile,
  buildPathFromEntrance as _buildPathFromEntrance,
  startLeaveOffice as _startLeaveOffice,
} from './entranceManager.js'

export class OfficeState {
  layout: OfficeLayout
  tileMap: TileTypeVal[][]
  seats: Map<string, Seat>
  blockedTiles: Set<string>
  furniture: FurnitureInstance[]
  walkableTiles: Array<{ col: number; row: number }>
  characters: Map<number, Character> = new Map()
  /** Accumulated time for furniture animation frame cycling */
  furnitureAnimTimer = 0
  _prevOpenDoors?: Set<string>
  _openDoorUids = new Set<string>()
  doorTiles = new Set<string>()
  selectedAgentId: number | null = null
  cameraFollowId: number | null = null
  hoveredAgentId: number | null = null
  hoveredTile: { col: number; row: number } | null = null
  /** Maps "parentId:toolId" → sub-agent character ID (negative) */
  subagentIdMap: Map<string, number> = new Map()
  /** Reverse lookup: sub-agent character ID → parent info */
  subagentMeta: Map<number, { parentAgentId: number; parentToolId: string }> = new Map()
  /** Agent role strings (e.g. "boss") — used for role-restricted seat assignment */
  agentRoles: Map<number, string> = new Map()
  private nextSubagentId = -1
  /** BFS distance map cache: key = "col,row" source → Map of distances to all reachable tiles */
  private distanceCache = new Map<string, Map<string, number>>()

  /** Expose a ClusterState view of this instance for standalone clustering functions */
  private get clusterState(): ClusterState {
    return {
      characters: this.characters,
      seats: this.seats,
      tileMap: this.tileMap,
      blockedTiles: this.blockedTiles,
      agentRoles: this.agentRoles,
      subagentMeta: this.subagentMeta,
      distanceCache: this.distanceCache,
    }
  }

  constructor(layout?: OfficeLayout) {
    this.layout = layout || createDefaultLayout()
    this.tileMap = layoutToTileMap(this.layout)
    this.seats = layoutToSeats(this.layout.furniture)
    applySeatFacingOverrides(this.seats)
    const seatTiles = getSeatTiles(this.seats)
    this.blockedTiles = getBlockedTiles(this.layout.furniture, seatTiles)
    this.doorTiles = this.computeDoorTiles()
    // Door bridge tiles must always be passable — unblock them globally
    for (const k of DOOR_BRIDGE_TILES) {
      this.blockedTiles.delete(k)
    }
    this.furniture = layoutToFurnitureInstances(this.layout.furniture)
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles)
  }

  /** Compute set of tile keys occupied by door furniture */
  private computeDoorTiles(): Set<string> {
    const tiles = new Set<string>()
    for (const item of this.layout.furniture) {
      if (!isDoorFurniture(item.type)) continue
      const entry = getCatalogEntry(item.type)
      if (!entry) continue
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          tiles.add(`${item.col + dc},${item.row + dr}`)
        }
      }
    }
    return tiles
  }

  /** Rebuild all derived state from a new layout. Reassigns existing characters.
   *  @param shift Optional pixel shift to apply when grid expands left/up */

  rebuildFromLayout(layout: OfficeLayout, shift?: { col: number; row: number }): void {
    this.layout = layout
    this.tileMap = layoutToTileMap(layout)
    this.seats = layoutToSeats(layout.furniture)
    applySeatFacingOverrides(this.seats)
    const seatTiles = getSeatTiles(this.seats)
    this.blockedTiles = getBlockedTiles(layout.furniture, seatTiles)
    this.doorTiles = this.computeDoorTiles()
    // Door bridge tiles must always be passable — unblock them globally
    for (const k of DOOR_BRIDGE_TILES) {
      this.blockedTiles.delete(k)
    }
    this.rebuildFurnitureInstances()
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles)
    this.distanceCache.clear()

    // Shift character positions when grid expands left/up
    if (shift && (shift.col !== 0 || shift.row !== 0)) {
      for (const ch of this.characters.values()) {
        ch.tileCol += shift.col
        ch.tileRow += shift.row
        ch.x += shift.col * TILE_SIZE
        ch.y += shift.row * TILE_SIZE
        // Clear path since tile coords changed
        ch.path = []
        ch.moveProgress = 0
      }
    }

    // Reassign characters to new seats, preserving existing assignments when possible
    // Hard invariant: one seat = one character
    for (const seat of this.seats.values()) {
      seat.assigned = false
    }

    // First pass: try to keep characters at their existing seats
    for (const ch of this.characters.values()) {
      if (ch.seatId && this.seats.has(ch.seatId)) {
        const seat = this.seats.get(ch.seatId)!
        if (!seat.assigned && !this.isSeatClaimed(ch.seatId, ch.id)) {
          seat.assigned = true
          // Snap character to seat position
          ch.tileCol = seat.seatCol
          ch.tileRow = seat.seatRow
          const cx = seat.seatCol * TILE_SIZE + TILE_SIZE / 2
          const cy = seat.seatRow * TILE_SIZE + TILE_SIZE / 2
          ch.x = cx
          ch.y = cy
          ch.dir = seat.facingDir
          continue
        }
      }
      ch.seatId = null // will be reassigned below
    }

    // Second pass: assign remaining characters to free seats
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue
      const seatId = this.findFreeSeat()
      if (seatId && this.claimSeat(seatId)) {
        ch.seatId = seatId
        const seat = this.seats.get(seatId)!
        ch.tileCol = seat.seatCol
        ch.tileRow = seat.seatRow
        ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2
        ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2
        ch.dir = seat.facingDir
      }
    }

    // Relocate any characters that ended up outside bounds or on non-walkable tiles
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue // seated characters are fine
      if (ch.tileCol < 0 || ch.tileCol >= layout.cols || ch.tileRow < 0 || ch.tileRow >= layout.rows) {
        this.relocateCharacterToWalkable(ch)
      }
    }
  }

  /** Move a character to a random walkable tile */
  private relocateCharacterToWalkable(ch: Character): void {
    if (this.walkableTiles.length === 0) return
    const spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
    ch.tileCol = spawn.col
    ch.tileRow = spawn.row
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
    ch.path = []
    ch.moveProgress = 0
  }

  getLayout(): OfficeLayout {
    return this.layout
  }

  /** Get the blocked-tile key for a character's own seat, or null */
  private ownSeatKey(ch: Character): string | null {
    if (!ch.seatId) return null
    const seat = this.seats.get(ch.seatId)
    if (!seat) return null
    return `${seat.seatCol},${seat.seatRow}`
  }

  /** Temporarily unblock a character's own seat, run fn, then restore original state */
  private withOwnSeatUnblocked<T>(ch: Character, fn: () => T): T {
    const key = this.ownSeatKey(ch)
    const wasBlocked = key ? this.blockedTiles.has(key) : false
    if (key) this.blockedTiles.delete(key)
    const result = fn()
    if (key && wasBlocked) this.blockedTiles.add(key)
    return result
  }

  /** Temporarily unblock the specific desk furniture item that the character's seat faces,
   *  run fn, then restore. Only the agent's own desk is unblocked — nearby tables and
   *  other desks remain solid so agents can't path through them. */
  private withOwnWorkspaceUnblocked<T>(ch: Character, fn: () => T): T {
    const unblockedKeys: string[] = []

    // Find the desk furniture item that the agent's seat faces
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId)
      if (seat) {
        // Direction offset from seat toward the desk it faces
        const dc = seat.facingDir === Direction.RIGHT ? 1 : seat.facingDir === Direction.LEFT ? -1 : 0
        const dr = seat.facingDir === Direction.DOWN ? 1 : seat.facingDir === Direction.UP ? -1 : 0
        const deskTileCol = seat.seatCol + dc
        const deskTileRow = seat.seatRow + dr

        // Find which furniture item owns that desk tile and unblock only its footprint
        for (const item of this.layout.furniture) {
          const entry = getCatalogEntry(item.type)
          if (!entry || !entry.isDesk) continue
          if (deskTileCol >= item.col && deskTileCol < item.col + entry.footprintW &&
              deskTileRow >= item.row && deskTileRow < item.row + entry.footprintH) {
            for (let r = 0; r < entry.footprintH; r++) {
              for (let c = 0; c < entry.footprintW; c++) {
                const key = `${item.col + c},${item.row + r}`
                if (this.blockedTiles.has(key)) {
                  this.blockedTiles.delete(key)
                  unblockedKeys.push(key)
                }
              }
            }
            break
          }
        }
      }
    }

    const result = fn()

    // Restore all temporarily unblocked tiles
    for (const k of unblockedKeys) {
      this.blockedTiles.add(k)
    }
    return result
  }

  /** Check if a seatId is already claimed by any live character (skip despawning). */
  private isSeatClaimed(seatId: string, excludeId?: number): boolean {
    return _isSeatClaimed(seatId, this.characters, excludeId)
  }

  /** Claim a seat: mark assigned + verify no other character holds it */
  private claimSeat(seatId: string): boolean {
    return _claimSeat(seatId, this.seats, this.characters)
  }

  /** Check if an agent's role allows them to sit in a given seat */
  private canSitInSeat(seat: Seat, agentId: number): boolean {
    return _canSitInSeat(seat, agentId, this.agentRoles)
  }

  // ── Team Clustering (delegated to teamClustering.ts) ──────────

  /** Walk up parent chain to find the root agent and hierarchy depth. */
  getAgentPriority(agentId: number): { priority: number; chainRoot: number } {
    return _getAgentPriority(agentId, this.clusterState)
  }

  /** Compute weighted centroid of a cluster */
  private getClusterCentroid(chainRoot: number) {
    return _getClusterCentroid(chainRoot, this.clusterState)
  }

  /** Snap fractional coordinates to the nearest walkable tile */
  private snapToWalkable(col: number, row: number) {
    return _snapToWalkable(col, row, this.tileMap, this.blockedTiles)
  }

  /** Get walking distance between two tiles. */
  private getWalkingDistance(fromCol: number, fromRow: number, toCol: number, toRow: number): number {
    return _getWalkingDistance(fromCol, fromRow, toCol, toRow, this.clusterState)
  }

  /** Get BFS distance map from a source tile (cached) */
  private getBfsDistanceMap(col: number, row: number): Map<string, number> {
    return _getBfsDistanceMap(col, row, this.clusterState)
  }

  /** Score a seat for team clustering. */
  private scoreClusterSeat(
    seat: Seat,
    parentCol: number, parentRow: number,
    centroidCol: number, centroidRow: number,
    priority: number,
    teammates: Array<{ col: number; row: number }>,
  ): number {
    return _scoreClusterSeat(seat, parentCol, parentRow, centroidCol, centroidRow, priority, teammates, this.clusterState)
  }

  /** Check if a seat is role-restricted and the agent's role matches */
  private isRoleSeatForAgent(seat: Seat, agentId: number): boolean {
    return _isRoleSeatForAgent(seat, agentId, this.agentRoles)
  }

  private findFreeSeat(agentId?: number): string | null {
    return _findFreeSeat(this.seats, this.characters, this.agentRoles, agentId)
  }

  /** Find the best free seat using team cluster scoring. */
  private findFreeSeatNear(parentAgentId: number, agentId?: number): string | null {
    return _findFreeSeatNear(
      parentAgentId,
      this.clusterState,
      agentId,
      (seatId, excludeId) => this.isSeatClaimed(seatId, excludeId),
      (seat, aid) => this.canSitInSeat(seat, aid),
      (seat, aid) => this.isRoleSeatForAgent(seat, aid),
      (aid) => this.findFreeSeat(aid),
    )
  }

  /** Update agent role and reassign to a role-appropriate seat if needed */
  setAgentRole(agentId: number, role: string): void {
    this.agentRoles.set(agentId, role)
    const ch = this.characters.get(agentId)
    if (!ch) return

    // Check if current seat is appropriate for the new role
    if (ch.seatId) {
      const currentSeat = this.seats.get(ch.seatId)
      if (currentSeat) {
        // If in a role-restricted seat that doesn't match, vacate
        if (currentSeat.requiredRoles && !currentSeat.requiredRoles.includes(role)) {
          currentSeat.assigned = false
          ch.seatId = null
        }
        // If there's a role-restricted seat available and agent qualifies, move to closest to team
        else if (!currentSeat.requiredRoles) {
          const cluster = this.getClusterCentroid(this.getAgentPriority(agentId).chainRoot)
          let bestUid: string | null = null
          let bestDist = Infinity
          const centroidSnap = this.snapToWalkable(cluster.col, cluster.row)
          for (const [uid, seat] of this.seats) {
            if (!seat.requiredRoles || !seat.requiredRoles.includes(role)) continue
            if (seat.assigned || this.isSeatClaimed(uid)) continue
            const d = this.getWalkingDistance(centroidSnap.col, centroidSnap.row, seat.seatCol, seat.seatRow)
            if (d < bestDist) { bestDist = d; bestUid = uid }
          }
          if (bestUid) {
            currentSeat.assigned = false
            if (this.claimSeat(bestUid)) {
              ch.seatId = bestUid
              this.sendToSeat(agentId)
            }
            return
          }
        }
      }
    }

    // If no seat yet, find one matching the role
    if (!ch.seatId) {
      const seatId = this.findFreeSeat(agentId)
      if (seatId && this.claimSeat(seatId)) {
        ch.seatId = seatId
        this.sendToSeat(agentId)
      }
    }
  }

  /** Force-sweep: move all agents with roles to their role-restricted seats.
   *  Called after initial load and after any seat save to prevent drift. */
  enforceRoleSeats(): void {
    // Collect agents that qualify for role-restricted seats, sorted by priority (P1 first)
    const candidates: Array<{ id: number; priority: number }> = []
    for (const [id, role] of this.agentRoles) {
      const ch = this.characters.get(id)
      if (!ch || ch.matrixEffect === 'despawn') continue
      // Check if any role-restricted seat exists for this role
      let hasRoleSeat = false
      for (const seat of this.seats.values()) {
        if (seat.requiredRoles && seat.requiredRoles.includes(role)) { hasRoleSeat = true; break }
      }
      if (!hasRoleSeat) continue
      // Check if already in a role-restricted seat
      if (ch.seatId) {
        const currentSeat = this.seats.get(ch.seatId)
        if (currentSeat?.requiredRoles && currentSeat.requiredRoles.includes(role)) continue // already correct
      }
      candidates.push({ id, priority: this.getAgentPriority(id).priority })
    }
    // Sort: lower priority number = higher rank = first pick
    candidates.sort((a, b) => a.priority - b.priority)

    for (const { id } of candidates) {
      const ch = this.characters.get(id)
      if (!ch) continue
      const role = this.agentRoles.get(id)
      if (!role) continue

      // Find best free role-restricted seat — closest to team cluster by walking distance
      const cluster = this.getClusterCentroid(this.getAgentPriority(id).chainRoot)
      const centroidSnap = this.snapToWalkable(cluster.col, cluster.row)
      let bestUid: string | null = null
      let bestDist = Infinity
      for (const [uid, seat] of this.seats) {
        if (!seat.requiredRoles || !seat.requiredRoles.includes(role)) continue
        if (seat.assigned || this.isSeatClaimed(uid)) continue
        const d = this.getWalkingDistance(centroidSnap.col, centroidSnap.row, seat.seatCol, seat.seatRow)
        if (d < bestDist) { bestDist = d; bestUid = uid }
      }
      if (!bestUid) continue

      // Vacate current seat
      if (ch.seatId) {
        const old = this.seats.get(ch.seatId)
        if (old) old.assigned = false
        ch.seatId = null
      }
      // Claim new role-restricted seat
      if (this.claimSeat(bestUid)) {
        ch.seatId = bestUid
        const seat = this.seats.get(bestUid)!
        // Walk to new seat
        const path = this.withOwnSeatUnblocked(ch, () =>
          findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles, this.doorTiles)
        )
        if (path.length > 0) {
          ch.path = path
          ch.moveProgress = 0
          ch.state = CharacterState.WALK
          ch.frame = 0
          ch.frameTimer = 0
        } else {
          // Already there or no path — snap
          ch.tileCol = seat.seatCol
          ch.tileRow = seat.seatRow
          ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2
          ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2
          ch.state = CharacterState.TYPE
          ch.dir = seat.facingDir
        }
      }
    }
  }

  /** Pick a diverse palette for a new agent based on currently active agents. */
  private pickDiversePalette(): { palette: number; hueShift: number } {
    return _pickDiversePalette(this.characters)
  }

  /** Resolve a stable entrance tile from layout or the nearest valid walkable tile. */
  private getEntranceTile(): { col: number; row: number } | null {
    return _getEntranceTile(this.layout, this.tileMap, this.blockedTiles, this.walkableTiles)
  }

  /** Build a path from the entrance tile to a target tile, unblocking door tiles */
  private buildPathFromEntrance(toCol: number, toRow: number): Array<{ col: number; row: number }> {
    return _buildPathFromEntrance(toCol, toRow, this.layout, this.tileMap, this.blockedTiles, this.walkableTiles, this.doorTiles)
  }


  /** Start the leave-office sequence: walk to entrance and despawn */
  private startLeaveOffice(ch: Character): void {
    _startLeaveOffice(ch, this.layout, this.tileMap, this.blockedTiles, this.walkableTiles)
  }

  addAgent(id: number, preferredPalette?: number, preferredHueShift?: number, preferredSeatId?: string, skipSpawnEffect?: boolean, folderName?: string, parentAgentId?: number): void {
    if (this.characters.has(id)) return

    let palette: number
    let hueShift: number
    if (preferredPalette !== undefined) {
      palette = preferredPalette
      hueShift = preferredHueShift ?? 0
    } else {
      const pick = this.pickDiversePalette()
      palette = pick.palette
      hueShift = pick.hueShift
    }

    // Try role-restricted seat first (boss/lead agents get priority for their chairs),
    // then preferred seat, then find a seat near parent (if subagent), then any free seat.
    // Hard invariant: one seat = one character, verified by claimSeat
    let seatId: string | null = null

    // If agent has a role, check for matching role-restricted seats first
    const agentRole = this.agentRoles.get(id)
    if (agentRole) {
      for (const [uid, seat] of this.seats) {
        if (seat.requiredRoles && seat.requiredRoles.includes(agentRole)
            && !seat.assigned && !this.isSeatClaimed(uid)) {
          if (this.claimSeat(uid)) { seatId = uid; break }
        }
      }
    }

    if (!seatId && preferredSeatId && parentAgentId === undefined && this.claimSeat(preferredSeatId)) {
      seatId = preferredSeatId
    }
    if (!seatId && parentAgentId !== undefined) {
      seatId = this.findFreeSeatNear(parentAgentId, id)
    }
    if (!seatId) {
      seatId = this.findFreeSeat(id)
    }
    // Claim the found seat (findFreeSeat doesn't mark assigned)
    if (seatId && !this.seats.get(seatId)?.assigned) {
      if (!this.claimSeat(seatId)) seatId = null
    }

    let ch: Character
    if (seatId) {
      const seat = this.seats.get(seatId)!
      ch = createCharacter(id, palette, seatId, seat, hueShift)
    } else {
      // No seats — spawn at random walkable tile (or near parent if subagent)
      let spawn = { col: 1, row: 1 }
      if (parentAgentId !== undefined) {
        const parentCh = this.characters.get(parentAgentId)
        if (parentCh && this.walkableTiles.length > 0) {
          // Find closest walkable tile to parent
          let best = this.walkableTiles[0]
          let bestDist = Math.abs(best.col - parentCh.tileCol) + Math.abs(best.row - parentCh.tileRow)
          for (let i = 1; i < this.walkableTiles.length; i++) {
            const d = Math.abs(this.walkableTiles[i].col - parentCh.tileCol) + Math.abs(this.walkableTiles[i].row - parentCh.tileRow)
            if (d < bestDist) {
              best = this.walkableTiles[i]
              bestDist = d
            }
          }
          spawn = best
        }
      } else if (this.walkableTiles.length > 0) {
        spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
      }
      ch = createCharacter(id, palette, null, null, hueShift)
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
      ch.tileCol = spawn.col
      ch.tileRow = spawn.row
      // No seat — don't type on the floor, stay idle
      ch.state = CharacterState.IDLE
      ch.wanderTimer = 0
    }

    if (folderName) {
      ch.folderName = folderName
    }
    if (parentAgentId !== undefined) {
      ch.isSubagent = true
      ch.parentAgentId = parentAgentId
    }
    if (!skipSpawnEffect) {
      const entrance = this.getEntranceTile()
      // Enter through the office door: spawn at entrance and walk to seat
      const targetCol = ch.tileCol
      const targetRow = ch.tileRow
      if (entrance) {
        ch.x = entrance.col * TILE_SIZE + TILE_SIZE / 2
        ch.y = entrance.row * TILE_SIZE + TILE_SIZE / 2
        ch.tileCol = entrance.col
        ch.tileRow = entrance.row
      }
      const path = entrance ? this.buildPathFromEntrance(targetCol, targetRow) : []
      if (path.length > 0) {
        ch.path = path
        ch.moveProgress = 0
        ch.state = CharacterState.WALK
        ch.frame = 0
        ch.frameTimer = 0
      } else {
        // No path from entrance — fall back to matrix spawn at seat
        ch.x = targetCol * TILE_SIZE + TILE_SIZE / 2
        ch.y = targetRow * TILE_SIZE + TILE_SIZE / 2
        ch.tileCol = targetCol
        ch.tileRow = targetRow
        ch.matrixEffect = 'spawn'
        ch.matrixEffectTimer = 0
        ch.matrixEffectSeeds = matrixEffectSeeds()
      }
    }
    this.characters.set(id, ch)
  }

  /** Revive a character that is mid-despawn (reconnecting agent with same ID) */
  reviveAgent(id: number, folderName?: string, parentAgentId?: number): void {
    const ch = this.characters.get(id)
    if (!ch) return

    // Cancel despawn animation
    ch.leavingOffice = false
    ch.matrixEffect = null
    ch.matrixEffectTimer = 0
    ch.matrixEffectSeeds = []
    ch.path = []
    ch.moveProgress = 0

    // Restore activity state
    ch.isActive = true
    ch.bubbleType = null
    ch.bubbleTimer = 0
    ch.bubbleText = ''
    ch.loungeTargetSeatId = null
    ch.coffeeSpotTarget = null
    ch.coffeeBreakTimer = 0
    ch.smokingSpotTarget = null
    ch.smokingBreakTimer = 0

    // Update metadata
    if (folderName) ch.folderName = folderName
    if (parentAgentId !== undefined) {
      ch.parentAgentId = parentAgentId
      ch.isSubagent = true
    }

    // Re-claim seat (was freed by removeAgent)
    let seatId: string | null = null
    if (parentAgentId !== undefined) {
      seatId = this.findFreeSeatNear(parentAgentId, id)
    }
    if (!seatId) {
      seatId = this.findFreeSeat(id)
    }
    if (seatId && !this.seats.get(seatId)?.assigned) {
      if (!this.claimSeat(seatId)) seatId = null
    }
    ch.seatId = seatId

    // Navigate to seat or idle
    if (seatId) {
      this.sendToSeat(id)
    } else {
      ch.state = CharacterState.IDLE
      ch.wanderTimer = 0
    }
  }

  removeAgent(id: number): void {
    const ch = this.characters.get(id)
    if (!ch) return
    if (ch.leavingOffice) return // already leaving
    if (ch.matrixEffect === 'despawn') return // already despawning
    // Free seat and clear selection immediately
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId)
      if (seat) seat.assigned = false
      ch.seatId = null
    }
    if (this.selectedAgentId === id) this.selectedAgentId = null
    if (this.cameraFollowId === id) this.cameraFollowId = null
    this.agentRoles.delete(id)
    // Walk to entrance and despawn there
    this.startLeaveOffice(ch)
  }

  /** Find seat uid at a given tile position, or null */
  getSeatAtTile(col: number, row: number): string | null {
    for (const [uid, seat] of this.seats) {
      if (seat.seatCol === col && seat.seatRow === row) return uid
    }
    return null
  }

  /** Reassign an agent from their current seat to a new seat */
  reassignSeat(agentId: number, seatId: string): void {
    const ch = this.characters.get(agentId)
    if (!ch) return
    // Check if target seat is already taken by another character
    if (this.isSeatClaimed(seatId, agentId)) return
    // Unassign old seat
    if (ch.seatId) {
      const old = this.seats.get(ch.seatId)
      if (old) old.assigned = false
    }
    // Assign new seat
    const seat = this.seats.get(seatId)
    if (!seat || seat.assigned) return
    seat.assigned = true
    ch.seatId = seatId
    // Pathfind to new seat (unblock own seat tile for this query)
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles, this.doorTiles)
    )
    if (path.length > 0) {
      ch.path = path
      ch.moveProgress = 0
      ch.state = CharacterState.WALK
      ch.frame = 0
      ch.frameTimer = 0
    } else {
      // Already at seat or no path — sit down
      ch.state = CharacterState.TYPE
      ch.dir = seat.facingDir
      ch.frame = 0
      ch.frameTimer = 0
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC
      }
    }
  }

  /** Reassign a child agent's seat to be near its parent (called on late parent resolution) */
  reassignNearParent(agentId: number, parentAgentId: number): void {
    const ch = this.characters.get(agentId)
    if (!ch) return
    const parentCh = this.characters.get(parentAgentId)
    if (!parentCh) return

    // Vacate current seat
    if (ch.seatId) {
      const old = this.seats.get(ch.seatId)
      if (old) old.assigned = false
      ch.seatId = null
    }

    // Find best seat near parent using cluster scoring
    const newSeatId = this.findFreeSeatNear(parentAgentId, agentId) ?? this.findFreeSeat(agentId)
    if (!newSeatId || !this.claimSeat(newSeatId)) return

    ch.seatId = newSeatId
    this.sendToSeat(agentId)
  }

  /** Post-load sweep: reassign child agents to seats nearer their parent's cluster.
   *  Only moves an agent if a significantly better seat exists (>30% score improvement).
   *  Called after initial load, after enforceRoleSeats(). */
  enforceTeamClusters(): void {
    const children: Array<{ id: number; parentAgentId: number; priority: number }> = []
    for (const ch of this.characters.values()) {
      if (ch.parentAgentId == null || ch.matrixEffect === 'despawn') continue
      const info = this.getAgentPriority(ch.id)
      children.push({ id: ch.id, parentAgentId: ch.parentAgentId, priority: info.priority })
    }
    children.sort((a, b) => a.priority - b.priority)

    for (const { id, parentAgentId } of children) {
      const ch = this.characters.get(id)
      if (!ch || !ch.seatId) continue
      const parentCh = this.characters.get(parentAgentId)
      if (!parentCh) continue

      // Score current seat
      const currentSeat = this.seats.get(ch.seatId)
      if (!currentSeat) continue
      const { chainRoot } = this.getAgentPriority(parentAgentId)
      const cluster = this.getClusterCentroid(chainRoot)
      const teammates = cluster.members.map(m => ({ col: m.col, row: m.row }))
      const parentSeat = parentCh.seatId ? this.seats.get(parentCh.seatId) : null
      const parentCol = parentSeat ? parentSeat.seatCol : parentCh.tileCol
      const parentRow = parentSeat ? parentSeat.seatRow : parentCh.tileRow
      const priority = this.getAgentPriority(id).priority
      const currentScore = this.scoreClusterSeat(
        currentSeat, parentCol, parentRow, cluster.col, cluster.row, priority, teammates,
      )

      // Find best alternative seat
      let bestUid: string | null = null
      let bestScore = Infinity
      for (const [uid, seat] of this.seats) {
        if (uid === ch.seatId) continue
        if (seat.assigned || seat.isLounge || this.isSeatClaimed(uid, id)) continue
        if (!this.canSitInSeat(seat, id)) continue
        const s = this.scoreClusterSeat(
          seat, parentCol, parentRow, cluster.col, cluster.row, priority, teammates,
        )
        if (s < bestScore) { bestScore = s; bestUid = uid }
      }

      // Only move if improvement is significant (>30% better)
      if (bestUid && bestScore < currentScore * 0.9) {
        currentSeat.assigned = false
        ch.seatId = null
        if (this.claimSeat(bestUid)) {
          ch.seatId = bestUid
          // Snap to new seat (initial load — no walk animation)
          const newSeat = this.seats.get(bestUid)!
          ch.tileCol = newSeat.seatCol
          ch.tileRow = newSeat.seatRow
          ch.x = newSeat.seatCol * TILE_SIZE + TILE_SIZE / 2
          ch.y = newSeat.seatRow * TILE_SIZE + TILE_SIZE / 2
          ch.dir = newSeat.facingDir
        }
      }
    }
  }

  /** Send an agent back to their currently assigned seat */
  sendToSeat(agentId: number): void {
    const ch = this.characters.get(agentId)
    if (!ch || !ch.seatId) return
    const seat = this.seats.get(ch.seatId)
    if (!seat) return
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles, this.doorTiles)
    )
    if (path.length > 0) {
      ch.path = path
      ch.moveProgress = 0
      ch.state = CharacterState.WALK
      ch.frame = 0
      ch.frameTimer = 0
    } else {
      // Already at seat — sit down
      ch.state = CharacterState.TYPE
      ch.dir = seat.facingDir
      ch.frame = 0
      ch.frameTimer = 0
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC
      }
    }
  }

  /** Walk an agent to an arbitrary walkable tile (right-click command) */
  walkToTile(agentId: number, col: number, row: number): boolean {
    const ch = this.characters.get(agentId)
    if (!ch || ch.isSubagent) return false
    if (!isWalkable(col, row, this.tileMap, this.blockedTiles)) {
      // Also allow walking to own seat tile (blocked for others but not self)
      const key = this.ownSeatKey(ch)
      if (!key || key !== `${col},${row}`) return false
    }
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, col, row, this.tileMap, this.blockedTiles, this.doorTiles)
    )
    if (path.length === 0) return false
    ch.path = path
    ch.moveProgress = 0
    ch.state = CharacterState.WALK
    ch.frame = 0
    ch.frameTimer = 0
    return true
  }

  /** Create a sub-agent character with the parent's palette. Returns the sub-agent ID.
   *  Seat priority: desk-facing near parent > non-lounge near parent > lounge near parent.
   *  Avoids clustering by preferring tiles not adjacent to existing subagents. */
  addSubagent(parentAgentId: number, parentToolId: string): number {
    const key = `${parentAgentId}:${parentToolId}`
    if (this.subagentIdMap.has(key)) return this.subagentIdMap.get(key)!

    const id = this.nextSubagentId--
    const parentCh = this.characters.get(parentAgentId)
    const pick = this.pickDiversePalette()
    const palette = pick.palette
    const hueShift = pick.hueShift

    // Cluster-aware seat scoring: find seat closest to team cluster
    // Use parent's seat position (stable) instead of current tile (may be wandering)
    const parentSeat = parentCh?.seatId ? this.seats.get(parentCh.seatId) : null
    const parentCol = parentSeat ? parentSeat.seatCol : (parentCh ? parentCh.tileCol : 0)
    const parentRow = parentSeat ? parentSeat.seatRow : (parentCh ? parentCh.tileRow : 0)
    const { chainRoot } = this.getAgentPriority(parentAgentId)
    const cluster = this.getClusterCentroid(chainRoot)
    const teammates = cluster.members.map(m => ({ col: m.col, row: m.row }))
    const priority = Math.min(this.getAgentPriority(parentAgentId).priority + 1, 4)

    const clusterScore = (seat: Seat) => this.scoreClusterSeat(
      seat, parentCol, parentRow, cluster.col, cluster.row, priority, teammates,
    )

    let bestSeatId: string | null = null
    let bestScore = Infinity

    // Priority 1: desk-facing non-lounge seats scored by cluster
    for (const [uid, seat] of this.seats) {
      if (seat.assigned || seat.isLounge || !seat.facesDesk || this.isSeatClaimed(uid)) continue
      if (!this.canSitInSeat(seat, id)) continue
      const s = clusterScore(seat)
      if (s < bestScore) { bestScore = s; bestSeatId = uid }
    }
    // Priority 2: any non-lounge seats
    if (!bestSeatId) {
      bestScore = Infinity
      for (const [uid, seat] of this.seats) {
        if (seat.assigned || seat.isLounge || this.isSeatClaimed(uid)) continue
        if (!this.canSitInSeat(seat, id)) continue
        const s = clusterScore(seat)
        if (s < bestScore) { bestScore = s; bestSeatId = uid }
      }
    }
    // Lounge seats (sofas, benches) are NEVER assigned as workstations — same rule as findFreeSeat

    let ch: Character
    if (bestSeatId && this.claimSeat(bestSeatId)) {
      const seat = this.seats.get(bestSeatId)!
      ch = createCharacter(id, palette, bestSeatId, seat, hueShift)
    } else {
      // No seats — spawn at closest walkable tile to cluster (by walking distance)
      let spawn = { col: 1, row: 1 }
      if (this.walkableTiles.length > 0) {
        const parentDistMap = this.getBfsDistanceMap(parentCol, parentRow)
        const centroidSnap = this.snapToWalkable(cluster.col, cluster.row)
        const centroidDistMap = this.getBfsDistanceMap(centroidSnap.col, centroidSnap.row)
        let closest = this.walkableTiles[0]
        let closestScore = Infinity
        for (const t of this.walkableTiles) {
          const tKey = `${t.col},${t.row}`
          const dParent = parentDistMap.get(tKey) ?? (Math.abs(t.col - parentCol) + Math.abs(t.row - parentRow)) * 3
          const dCentroid = centroidDistMap.get(tKey) ?? (Math.abs(t.col - cluster.col) + Math.abs(t.row - cluster.row)) * 3
          const s = dParent + dCentroid
          if (s < closestScore) { closest = t; closestScore = s }
        }
        spawn = closest
      }
      ch = createCharacter(id, palette, null, null, hueShift)
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
      ch.tileCol = spawn.col
      ch.tileRow = spawn.row
    }
    ch.isSubagent = true
    ch.parentAgentId = parentAgentId
    // Enter through the office door: spawn at entrance and walk to seat
    const targetCol = ch.tileCol
    const targetRow = ch.tileRow
    const entrance = this.getEntranceTile()
    if (entrance) {
      ch.x = entrance.col * TILE_SIZE + TILE_SIZE / 2
      ch.y = entrance.row * TILE_SIZE + TILE_SIZE / 2
      ch.tileCol = entrance.col
      ch.tileRow = entrance.row
    }
    const entrancePath = entrance ? this.buildPathFromEntrance(targetCol, targetRow) : []
    if (entrancePath.length > 0) {
      ch.path = entrancePath
      ch.moveProgress = 0
      ch.state = CharacterState.WALK
      ch.frame = 0
      ch.frameTimer = 0
    } else {
      // No path from entrance — fall back to matrix spawn at seat
      ch.x = targetCol * TILE_SIZE + TILE_SIZE / 2
      ch.y = targetRow * TILE_SIZE + TILE_SIZE / 2
      ch.tileCol = targetCol
      ch.tileRow = targetRow
      ch.matrixEffect = 'spawn'
      ch.matrixEffectTimer = 0
      ch.matrixEffectSeeds = matrixEffectSeeds()
    }
    this.characters.set(id, ch)

    this.subagentIdMap.set(key, id)
    this.subagentMeta.set(id, { parentAgentId, parentToolId })
    return id
  }

  /** Remove a specific sub-agent character and free its seat */
  removeSubagent(parentAgentId: number, parentToolId: string): void {
    const key = `${parentAgentId}:${parentToolId}`
    const id = this.subagentIdMap.get(key)
    if (id === undefined) return

    const ch = this.characters.get(id)
    if (ch) {
      if (ch.leavingOffice || ch.matrixEffect === 'despawn') {
        // Already leaving/despawning — just clean up maps
        this.subagentIdMap.delete(key)
        this.subagentMeta.delete(id)
        return
      }
      if (ch.seatId) {
        const seat = this.seats.get(ch.seatId)
        if (seat) seat.assigned = false
        ch.seatId = null
      }
      // Walk to entrance and despawn there
      this.startLeaveOffice(ch)
    }
    // Clean up tracking maps immediately so keys don't collide
    this.subagentIdMap.delete(key)
    this.subagentMeta.delete(id)
    if (this.selectedAgentId === id) this.selectedAgentId = null
    if (this.cameraFollowId === id) this.cameraFollowId = null
  }

  /** Remove all sub-agents belonging to a parent agent */
  removeAllSubagents(parentAgentId: number): void {
    const toRemove: string[] = []
    for (const [key, id] of this.subagentIdMap) {
      const meta = this.subagentMeta.get(id)
      if (meta && meta.parentAgentId === parentAgentId) {
        const ch = this.characters.get(id)
        if (ch) {
          if (ch.leavingOffice || ch.matrixEffect === 'despawn') {
            // Already leaving/despawning — just clean up maps
            this.subagentMeta.delete(id)
            toRemove.push(key)
            continue
          }
          if (ch.seatId) {
            const seat = this.seats.get(ch.seatId)
            if (seat) seat.assigned = false
            ch.seatId = null
          }
          // Walk to entrance and despawn there
          this.startLeaveOffice(ch)
        }
        this.subagentMeta.delete(id)
        if (this.selectedAgentId === id) this.selectedAgentId = null
        if (this.cameraFollowId === id) this.cameraFollowId = null
        toRemove.push(key)
      }
    }
    for (const key of toRemove) {
      this.subagentIdMap.delete(key)
    }
  }

  /** Look up the sub-agent character ID for a given parent+toolId, or null */
  getSubagentId(parentAgentId: number, parentToolId: string): number | null {
    return this.subagentIdMap.get(`${parentAgentId}:${parentToolId}`) ?? null
  }

  setAgentActive(id: number, active: boolean): void {
    const ch = this.characters.get(id)
    if (!ch) return
    ch.isActive = active
    if (!active) {
      // Sentinel -1: signals turn just ended, skip next seat rest timer.
      // In TYPE state, seatTimer <= 0 triggers immediate IDLE transition.
      ch.seatTimer = -1
      // If walking, let the character finish the path before changing behavior
      if (ch.state !== CharacterState.WALK) {
        ch.path = []
        ch.moveProgress = 0
      }
    } else {
      // Cancel sofa/coffee/smoking targets — active agent should head back to desk
      if (ch.loungeTargetSeatId) {
        ch.loungeTargetSeatId = null
        // Don't clear path — WALK state will repath to seat after current step
      }
      ch.coffeeBreakTimer = 0
      ch.coffeeSpotTarget = null
      ch.smokingBreakTimer = 0
      ch.smokingSpotTarget = null
      // Ensure boss/lead agents return to role-restricted seat closest to team cluster
      const role = this.agentRoles.get(id)
      if (role && ch.seatId) {
        const currentSeat = this.seats.get(ch.seatId)
        // If current seat is NOT role-restricted but one is available, switch
        if (!currentSeat?.requiredRoles || !currentSeat.requiredRoles.includes(role)) {
          const cluster = this.getClusterCentroid(this.getAgentPriority(id).chainRoot)
          let bestUid: string | null = null
          let bestDist = Infinity
          for (const [uid, seat] of this.seats) {
            if (!seat.requiredRoles || !seat.requiredRoles.includes(role)) continue
            if (seat.assigned || this.isSeatClaimed(uid)) continue
            const d = Math.abs(seat.seatCol - cluster.col) + Math.abs(seat.seatRow - cluster.row)
            if (d < bestDist) { bestDist = d; bestUid = uid }
          }
          if (bestUid) {
            // Vacate old seat
            if (currentSeat) currentSeat.assigned = false
            ch.seatId = null
            // Claim role seat closest to team
            if (this.claimSeat(bestUid)) {
              ch.seatId = bestUid
            }
          }
        }
      }
      // Force pathfind to assigned seat on activation (skip multi-tick state machine delay)
      // If walking, let WALK state handler repath to seat after current step
      if (ch.seatId && ch.state !== CharacterState.WALK) {
        const seat = this.seats.get(ch.seatId)
        if (seat && (ch.tileCol !== seat.seatCol || ch.tileRow !== seat.seatRow)) {
          this.sendToSeat(id)
        }
      }
    }
    this.rebuildFurnitureInstances()
  }

  /** Rebuild furniture instances with auto-state applied (active agents turn electronics ON) */
  private rebuildFurnitureInstances(): void {
    // Collect tiles where active agents face desks
    const autoOnTiles = new Set<string>()
    for (const ch of this.characters.values()) {
      if (!ch.isActive || !ch.seatId) continue
      const seat = this.seats.get(ch.seatId)
      if (!seat) continue
      // Find the desk tile(s) the agent faces from their seat
      const dCol = seat.facingDir === Direction.RIGHT ? 1 : seat.facingDir === Direction.LEFT ? -1 : 0
      const dRow = seat.facingDir === Direction.DOWN ? 1 : seat.facingDir === Direction.UP ? -1 : 0
      // Check tiles in the facing direction (desk could be 1-3 tiles deep)
      for (let d = 1; d <= AUTO_ON_FACING_DEPTH; d++) {
        const tileCol = seat.seatCol + dCol * d
        const tileRow = seat.seatRow + dRow * d
        autoOnTiles.add(`${tileCol},${tileRow}`)
      }
      // Also check tiles to the sides of the facing direction (desks can be wide)
      for (let d = 1; d <= AUTO_ON_SIDE_DEPTH; d++) {
        const baseCol = seat.seatCol + dCol * d
        const baseRow = seat.seatRow + dRow * d
        if (dCol !== 0) {
          // Facing left/right: check tiles above and below
          autoOnTiles.add(`${baseCol},${baseRow - 1}`)
          autoOnTiles.add(`${baseCol},${baseRow + 1}`)
        } else {
          // Facing up/down: check tiles left and right
          autoOnTiles.add(`${baseCol - 1},${baseRow}`)
          autoOnTiles.add(`${baseCol + 1},${baseRow}`)
        }
      }
    }

    // Door open detection — open only when a WALKING agent is on door tile or next step is door
    const openDoorUids = new Set<string>()
    for (const item of this.layout.furniture) {
      if (!isDoorFurniture(item.type)) continue
      const entry = getCatalogEntry(item.type)
      const doorKeys = new Set<string>()
      const fw = entry?.footprintW ?? 1
      const fh = entry?.footprintH ?? 2
      for (let dr = 0; dr < fh; dr++) {
        for (let dc = 0; dc < fw; dc++) {
          doorKeys.add(`${item.col + dc},${item.row + dr}`)
        }
      }
      for (const ch of this.characters.values()) {
        if (ch.state !== CharacterState.WALK || ch.path.length === 0) continue
        // Open only if agent is ON the door tile right now
        if (doorKeys.has(`${ch.tileCol},${ch.tileRow}`)) {
          openDoorUids.add(item.uid)
          break
        }
        // Or next step is the door tile (about to enter)
        const next = ch.path[0]
        if (next && doorKeys.has(`${next.col},${next.row}`)) {
          openDoorUids.add(item.uid)
          break
        }
      }
    }

    // Track door state changes for blocking recalc
    if (this._prevOpenDoors === undefined) this._prevOpenDoors = new Set<string>()
    let doorsChanged = openDoorUids.size !== this._prevOpenDoors.size
    if (!doorsChanged) {
      for (const uid of openDoorUids) {
        if (!this._prevOpenDoors.has(uid)) { doorsChanged = true; break }
      }
    }
    this._prevOpenDoors = openDoorUids

    // Rebuild blocked tiles if door states changed
    if (doorsChanged) {
      this._openDoorUids = openDoorUids
      this.blockedTiles = getBlockedTiles(this.layout.furniture, undefined, openDoorUids)
      this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles)
      this.distanceCache.clear()
    }

    // Build modified furniture list with auto-state and animation applied
    const animFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC)
    const hasAutoOn = autoOnTiles.size > 0
    const modifiedFurniture: PlacedFurniture[] = this.layout.furniture.map((item) => {
      // Door auto-open based on proximity — show last frame (fully open), no loop
      if (isDoorFurniture(item.type) && openDoorUids.has(item.uid)) {
        const onType = getOnStateType(item.type)
        if (onType !== item.type) {
          const onFrames = getAnimationFrames(onType)
          // Use last frame = fully open (no cycling)
          const finalType = onFrames && onFrames.length > 0 ? onFrames[onFrames.length - 1] : onType
          return { ...item, type: finalType }
        }
      }
      const entry = getCatalogEntry(item.type)
      if (!entry) return item

      // Always-on animations: items with animation frames but no state toggle (e.g. fireplaces)
      const frames = getAnimationFrames(item.type)
      if (frames && frames.length > 1) {
        const toggled = getOnStateType(item.type)
        // If getOnStateType returns the same type, this is NOT a state-toggled item → always animate
        if (toggled === item.type) {
          const frameIdx = animFrame % frames.length
          return { ...item, type: frames[frameIdx] }
        }
      }

      // Auto-on: active agents turn electronics ON (skip doors — handled by door detection above)
      if (!hasAutoOn) return item
      if (isDoorFurniture(item.type)) return item
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          if (autoOnTiles.has(`${item.col + dc},${item.row + dr}`)) {
            let onType = getOnStateType(item.type)
            if (onType !== item.type) {
              // Check if the on-state type has animation frames
              const onFrames = getAnimationFrames(onType)
              if (onFrames && onFrames.length > 1) {
                const frameIdx = animFrame % onFrames.length
                onType = onFrames[frameIdx]
              }
              return { ...item, type: onType }
            }
            return item
          }
        }
      }
      return item
    })

    this.furniture = layoutToFurnitureInstances(modifiedFurniture)
  }

  setAgentTool(id: number, tool: string | null): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.currentTool = tool
    }
  }

  showPermissionBubble(id: number): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.bubbleType = 'permission'
      ch.bubbleTimer = 0
    }
  }

  clearPermissionBubble(id: number): void {
    const ch = this.characters.get(id)
    if (ch && ch.bubbleType === 'permission') {
      ch.bubbleType = null
      ch.bubbleTimer = 0
    }
  }

  showActivityBubble(id: number, text: string): void {
    const ch = this.characters.get(id)
    if (!ch) return
    // Don't override permission bubbles
    if (ch.bubbleType === 'permission') return
    const short = text.length > ACTIVITY_BUBBLE_MAX_CHARS
      ? text.slice(0, ACTIVITY_BUBBLE_MAX_CHARS) + '\u2026'
      : text
    ch.bubbleType = 'activity'
    ch.bubbleText = short
    ch.bubbleTimer = ACTIVITY_BUBBLE_DURATION_SEC
  }

  showWaitingBubble(id: number): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.bubbleType = 'waiting'
      ch.bubbleTimer = WAITING_BUBBLE_DURATION_SEC
    }
  }

  /** Force an agent to go on a coffee break immediately */
  forceCoffeeBreak(id: number): void {
    const ch = this.characters.get(id)
    if (!ch) return
    const coffeeSpot = findFreeCoffeeSpot(
      this.getLayout().furniture, ch, this.characters, this.tileMap, this.blockedTiles,
    )
    if (!coffeeSpot) return
    const path = findPath(ch.tileCol, ch.tileRow, coffeeSpot.col, coffeeSpot.row, this.tileMap, this.blockedTiles, this.doorTiles)
    if (path.length > 0) {
      ch.path = path
      ch.moveProgress = 0
      ch.state = CharacterState.WALK
      ch.frame = 0
      ch.frameTimer = 0
      ch.coffeeSpotTarget = coffeeSpot
      ch.isActive = false
    }
  }

  /** Force an agent to go on a smoking break immediately */
  forceSmokingBreak(id: number): void {
    const ch = this.characters.get(id)
    if (!ch) return
    const spot = findFreeSmokingSpot(ch, this.characters, this.tileMap, this.blockedTiles, this.walkableTiles)
    if (!spot) return
    const path = findPath(ch.tileCol, ch.tileRow, spot.col, spot.row, this.tileMap, this.blockedTiles, this.doorTiles)
    if (path.length > 0) {
      ch.path = path
      ch.moveProgress = 0
      ch.state = CharacterState.WALK
      ch.frame = 0
      ch.frameTimer = 0
      ch.smokingSpotTarget = spot
      ch.isActive = false
    }
  }

  /** Dismiss bubble on click — permission: instant, waiting/activity: quick fade */
  dismissBubble(id: number): void {
    const ch = this.characters.get(id)
    if (!ch || !ch.bubbleType) return
    if (ch.bubbleType === 'permission') {
      ch.bubbleType = null
      ch.bubbleTimer = 0
    } else if (ch.bubbleType === 'waiting' || ch.bubbleType === 'activity') {
      ch.bubbleTimer = Math.min(ch.bubbleTimer, DISMISS_BUBBLE_FAST_FADE_SEC)
    }
  }

  update(dt: number): void {
    // ── Seat invariant repair: 1 seat = 1 character ──────────────────
    // Detect and fix any double-seated agents (defensive sweep)
    const seatOwners = new Map<string, number>()
    for (const ch of this.characters.values()) {
      if (!ch.seatId || ch.matrixEffect === 'despawn') continue
      const existing = seatOwners.get(ch.seatId)
      if (existing !== undefined) {
        // Conflict: two live characters claim the same seat — evict the later one
        ch.seatId = null
        ch.state = CharacterState.IDLE
        ch.wanderTimer = 0
      } else {
        seatOwners.set(ch.seatId, ch.id)
      }
    }
    // Sync seat.assigned flags with actual ownership
    for (const [uid, seat] of this.seats) {
      const shouldBeAssigned = seatOwners.has(uid)
      if (seat.assigned !== shouldBeAssigned) {
        seat.assigned = shouldBeAssigned
      }
    }

    // Furniture animation cycling
    const prevFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC)
    this.furnitureAnimTimer += dt
    const newFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC)
    if (newFrame !== prevFrame) {
      this.rebuildFurnitureInstances()
    }

    const toDelete: number[] = []
    for (const ch of this.characters.values()) {
      // Handle matrix effect animation
      if (ch.matrixEffect) {
        ch.matrixEffectTimer += dt
        if (ch.matrixEffectTimer >= MATRIX_EFFECT_DURATION) {
          if (ch.matrixEffect === 'spawn') {
            // Spawn complete — clear effect, resume normal FSM
            ch.matrixEffect = null
            ch.matrixEffectTimer = 0
            ch.matrixEffectSeeds = []
          } else {
            // Despawn complete — mark for deletion
            toDelete.push(ch.id)
          }
        }
        continue // skip normal FSM while effect is active
      }

      if (!ch.isActive) {
        // Idle agents: unblock only desk tiles near their own seat so they can leave workspace,
        // but keep all other desks/tables blocked to prevent walking through them
        this.withOwnWorkspaceUnblocked(ch, () =>
          updateCharacter(ch, dt, this.walkableTiles, this.seats, this.tileMap, this.blockedTiles, this.characters, this.layout.furniture, this.doorTiles)
        )
      } else {
        // Active agents: normal furniture blocking, unblock own seat
        this.withOwnSeatUnblocked(ch, () =>
          updateCharacter(ch, dt, this.walkableTiles, this.seats, this.tileMap, this.blockedTiles, this.characters, this.layout.furniture, this.doorTiles)
        )
      }
      // Expose state for debugging
      ;(globalThis as typeof globalThis & { __pixelAgentsOS?: OfficeState }).__pixelAgentsOS = this;

      // Tick bubble timer for waiting / activity bubbles
      if (ch.bubbleType === 'waiting' || ch.bubbleType === 'activity') {
        ch.bubbleTimer -= dt
        if (ch.bubbleTimer <= 0) {
          ch.bubbleType = null
          ch.bubbleTimer = 0
          ch.bubbleText = ''
        }
      }
    }
    // Check for characters that arrived at the entrance — start despawn effect
    for (const ch of this.characters.values()) {
      if (ch.leavingOffice && ch.path.length === 0 && !ch.matrixEffect) {
        ch.matrixEffect = 'despawn'
        ch.matrixEffectTimer = 0
        ch.matrixEffectSeeds = matrixEffectSeeds()
      }
    }
    // Remove characters that finished despawn
    for (const id of toDelete) {
      this.characters.delete(id)
    }
  }

  getCharacters(): Character[] {
    return Array.from(this.characters.values())
  }

  /** Get character at pixel position (for hit testing). Returns id or null. */
  getCharacterAt(worldX: number, worldY: number): number | null {
    const chars = this.getCharacters().sort((a, b) => b.y - a.y)
    for (const ch of chars) {
      // Skip characters that are leaving or despawning
      if (ch.leavingOffice || ch.matrixEffect === 'despawn') continue
      // Character sprite is 16x24, anchored bottom-center
      // Apply sitting offset to match visual position
      const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0
      const anchorY = ch.y + sittingOffset
      const left = ch.x - CHARACTER_HIT_HALF_WIDTH
      const right = ch.x + CHARACTER_HIT_HALF_WIDTH
      const top = anchorY - CHARACTER_HIT_HEIGHT
      const bottom = anchorY
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return ch.id
      }
    }
    return null
  }
}
