import { CharacterState, Direction, TILE_SIZE } from '../types.js'
import type { Character, Seat, SpriteData, TileType as TileTypeVal, PlacedFurniture } from '../types.js'
import type { CharacterSprites } from '../sprites/spriteData.js'
import { findPath, bfsDistanceMap, isWalkable } from '../layout/tileMap.js'
import { getCatalogEntry } from '../layout/furnitureCatalog.js'
import {
  WALK_SPEED_PX_PER_SEC,
  WALK_FRAME_DURATION_SEC,
  TYPE_FRAME_DURATION_SEC,
  WANDER_PAUSE_MIN_SEC,
  WANDER_PAUSE_MAX_SEC,
  WANDER_MOVES_BEFORE_REST_MIN,
  WANDER_MOVES_BEFORE_REST_MAX,
  SEAT_REST_MIN_SEC,
  SEAT_REST_MAX_SEC,
  COFFEE_BREAK_CHANCE,
  COFFEE_BREAK_MIN_SEC,
  COFFEE_BREAK_MAX_SEC,
  SMOKING_BREAK_CHANCE,
  SMOKING_BREAK_MIN_SEC,
  SMOKING_BREAK_MAX_SEC,
} from '../../constants.js'

/** Tools that show reading animation instead of typing */
const READING_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'])

export function isReadingTool(tool: string | null): boolean {
  if (!tool) return false
  return READING_TOOLS.has(tool)
}

/** Pixel center of a tile */
function tileCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  }
}

/** Direction from one tile to an adjacent tile */
function directionBetween(fromCol: number, fromRow: number, toCol: number, toRow: number): Direction {
  const dc = toCol - fromCol
  const dr = toRow - fromRow
  if (dc > 0) return Direction.RIGHT
  if (dc < 0) return Direction.LEFT
  if (dr > 0) return Direction.DOWN
  return Direction.UP
}

export function createCharacter(
  id: number,
  palette: number,
  seatId: string | null,
  seat: Seat | null,
  hueShift = 0,
): Character {
  const col = seat ? seat.seatCol : 1
  const row = seat ? seat.seatRow : 1
  const center = tileCenter(col, row)
  return {
    id,
    state: CharacterState.TYPE,
    dir: seat ? seat.facingDir : Direction.DOWN,
    x: center.x,
    y: center.y,
    tileCol: col,
    tileRow: row,
    path: [],
    moveProgress: 0,
    currentTool: null,
    palette,
    hueShift,
    frame: 0,
    frameTimer: 0,
    wanderTimer: 0,
    wanderCount: 0,
    wanderLimit: randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX),
    isActive: true,
    seatId,
    bubbleType: null,
    bubbleTimer: 0,
    bubbleText: '',
    seatTimer: 0,
    isSubagent: false,
    parentAgentId: null,
    matrixEffect: null,
    matrixEffectTimer: 0,
    matrixEffectSeeds: [],
    loungeTargetSeatId: null,
    coffeeSpotTarget: null,
    coffeeBreakTimer: 0,
    smokingSpotTarget: null,
    smokingBreakTimer: 0,
    leavingOffice: false,
  }
}

/** Minimum tile distance subagent keeps from parent (avoids crowding) */
const SUBAGENT_MIN_DISTANCE = 2
/** Maximum tile distance before subagent starts walking toward parent */
const SUBAGENT_MAX_DISTANCE = 6

/** Check if character is currently sitting on a lounge seat (sofa/bench) */
function isOnLoungeSeat(ch: Character, seats: Map<string, Seat>): boolean {
  for (const seat of seats.values()) {
    if (seat.isLounge && seat.seatCol === ch.tileCol && seat.seatRow === ch.tileRow) return true
  }
  return false
}

/** Check if character is sitting at their own assigned role-restricted seat (boss chair) */
function isOnRoleRestrictedSeat(ch: Character, seats: Map<string, Seat>): boolean {
  if (!ch.seatId) return false
  const seat = seats.get(ch.seatId)
  if (!seat || !seat.requiredRoles) return false
  return seat.seatCol === ch.tileCol && seat.seatRow === ch.tileRow
}

/** Find a free lounge seat (sofa/bench, not at a desk) for an idle agent to sit on.
 *  Uses BFS walking distance to pick the nearest reachable seat. */
function findFreeLoungeSeat(
  seats: Map<string, Seat>,
  ch: Character,
  allCharacters?: Map<number, Character>,
  _tileMap?: TileTypeVal[][],
  _blockedTiles?: Set<string>,
): Seat | null {
  void _tileMap
  void _blockedTiles
  // Build set of claimed seat UIDs (characters walking toward or sitting on a seat)
  const claimedSeats = new Set<string>()
  const occupied = new Set<string>()
  if (allCharacters) {
    for (const other of allCharacters.values()) {
      if (other.id === ch.id) continue
      occupied.add(`${other.tileCol},${other.tileRow}`)
      // Reserve loungeTarget so two characters don't walk to the same sofa
      if (other.loungeTargetSeatId) claimedSeats.add(other.loungeTargetSeatId)
    }
  }

  // Lounge seat tiles are blocked (can't walk through), so BFS won't reach them.
  // Use Manhattan distance as heuristic; actual reachability verified by findPath later.
  let bestSeat: Seat | null = null
  let bestDist = Infinity
  for (const seat of seats.values()) {
    if (!seat.isLounge) continue
    if (seat.assigned) continue
    if (claimedSeats.has(seat.uid)) continue
    if (ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) continue
    if (occupied.has(`${seat.seatCol},${seat.seatRow}`)) continue
    const dist = Math.abs(seat.seatCol - ch.tileCol) + Math.abs(seat.seatRow - ch.tileRow)
    if (dist < bestDist) {
      bestDist = dist
      bestSeat = seat
    }
  }
  return bestSeat
}

/** Find a free tile adjacent to a cooler/vending machine for a coffee break. */
export function findFreeCoffeeSpot(
  placedFurniture: PlacedFurniture[] | undefined,
  ch: Character,
  allCharacters: Map<number, Character> | undefined,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): { col: number; row: number } | null {
  if (!placedFurniture || placedFurniture.length === 0) return null

  // Build set of occupied / claimed coffee tiles
  const occupied = new Set<string>()
  if (allCharacters) {
    for (const other of allCharacters.values()) {
      if (other.id === ch.id) continue
      occupied.add(`${other.tileCol},${other.tileRow}`)
      if (other.coffeeSpotTarget) {
        occupied.add(`${other.coffeeSpotTarget.col},${other.coffeeSpotTarget.row}`)
      }
    }
  }

  const coffeeTargets = new Set<string>()
  const coffeeSpots: Array<{ col: number; row: number }> = []

  for (const item of placedFurniture) {
    const typeLower = (item.type || '').toLowerCase()
    if (typeLower !== 'cooler' && !typeLower.includes('vending') && !typeLower.includes('fridge') && !typeLower.includes('coffee')) continue

    const entry = getCatalogEntry(item.type)
    const fw = entry?.footprintW ?? 1
    const fh = entry?.footprintH ?? 1

    // Check adjacent walkable tiles around the furniture footprint
    for (let dr = -1; dr <= fh; dr++) {
      for (let dc = -1; dc <= fw; dc++) {
        if (dr >= 0 && dr < fh && dc >= 0 && dc < fw) continue // skip interior
        const tc = item.col + dc
        const tr = item.row + dr
        if (tc < 0 || tr < 0) continue
        if (tr >= tileMap.length || tc >= (tileMap[0]?.length || 0)) continue
        const key = `${tc},${tr}`
        if (occupied.has(key)) continue
        if (coffeeTargets.has(key)) continue
        if (isWalkable(tc, tr, tileMap, blockedTiles)) {
          coffeeSpots.push({ col: tc, row: tr })
          coffeeTargets.add(key)
        }
      }
    }
  }

  if (coffeeSpots.length === 0) return null

  // Pick nearest by BFS
  const distMap = bfsDistanceMap(ch.tileCol, ch.tileRow, tileMap, blockedTiles)
  let best: { col: number; row: number } | null = null
  let bestDist = Infinity
  for (const spot of coffeeSpots) {
    const dist = distMap.get(`${spot.col},${spot.row}`) ?? Infinity
    if (dist < bestDist) {
      bestDist = dist
      best = spot
    }
  }
  return best
}

/** Find a free walkable tile near the character for a smoking break (no furniture needed). */
export function findFreeSmokingSpot(
  ch: Character,
  allCharacters: Map<number, Character> | undefined,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
  walkableTiles: Array<{ col: number; row: number }>,
): { col: number; row: number } | null {
  if (walkableTiles.length === 0) return null

  // Build occupied set
  const occupied = new Set<string>()
  if (allCharacters) {
    for (const other of allCharacters.values()) {
      if (other.id === ch.id) continue
      occupied.add(`${other.tileCol},${other.tileRow}`)
      if (other.smokingSpotTarget) occupied.add(`${other.smokingSpotTarget.col},${other.smokingSpotTarget.row}`)
      if (other.coffeeSpotTarget) occupied.add(`${other.coffeeSpotTarget.col},${other.coffeeSpotTarget.row}`)
    }
  }

  // Find walkable spots 3-8 tiles away (Manhattan) from current position
  const candidates: Array<{ col: number; row: number; dist: number }> = []
  for (const t of walkableTiles) {
    const d = Math.abs(t.col - ch.tileCol) + Math.abs(t.row - ch.tileRow)
    if (d < 3 || d > 8) continue
    const key = `${t.col},${t.row}`
    if (occupied.has(key)) continue
    if (!isWalkable(t.col, t.row, tileMap, blockedTiles)) continue
    candidates.push({ col: t.col, row: t.row, dist: d })
  }
  if (candidates.length === 0) return null

  // Pick a random candidate from the closest third
  candidates.sort((a, b) => a.dist - b.dist)
  const pick = candidates[Math.floor(Math.random() * Math.min(candidates.length, Math.ceil(candidates.length / 3)))]
  return { col: pick.col, row: pick.row }
}

export function updateCharacter(
  ch: Character,
  dt: number,
  walkableTiles: Array<{ col: number; row: number }>,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
  allCharacters?: Map<number, Character>,
  placedFurniture?: PlacedFurniture[],
  doorTiles?: Set<string>,
): void {
  ch.frameTimer += dt

  switch (ch.state) {
    case CharacterState.TYPE: {
      if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
        ch.frameTimer -= TYPE_FRAME_DURATION_SEC
        ch.frame = (ch.frame + 1) % 2
      }
      // If active and sitting on a sofa — get up and go to desk
      if (ch.isActive) {
        let onSofa = false
        for (const seat of seats.values()) {
          if (seat.isLounge && seat.seatCol === ch.tileCol && seat.seatRow === ch.tileRow) {
            onSofa = true
            break
          }
        }
        if (onSofa) {
          ch.state = CharacterState.IDLE
          ch.seatTimer = 0
          ch.frame = 0
          ch.frameTimer = 0
          break
        }
      }
      // If no longer active, stand up and start wandering (after seatTimer expires)
      if (!ch.isActive) {
        // On lounge seat (sofa) — stay seated until active again
        if (isOnLoungeSeat(ch, seats)) break
        // Boss/lead: stay at role-restricted chair even when idle
        if (isOnRoleRestrictedSeat(ch, seats)) break

        if (ch.seatTimer > 0) {
          ch.seatTimer -= dt
          break
        }
        ch.seatTimer = 0 // clear sentinel
        ch.state = CharacterState.IDLE
        ch.frame = 0
        ch.frameTimer = 0
        // Boss/lead: prefer returning to role-restricted seat over sofa
        if (ch.seatId) {
          const ownSeat = seats.get(ch.seatId)
          if (ownSeat?.requiredRoles && (ch.tileCol !== ownSeat.seatCol || ch.tileRow !== ownSeat.seatRow)) {
            const ownPath = findPath(ch.tileCol, ch.tileRow, ownSeat.seatCol, ownSeat.seatRow, tileMap, blockedTiles, doorTiles)
            if (ownPath.length > 0) {
              ch.path = ownPath
              ch.moveProgress = 0
              ch.state = CharacterState.WALK
              ch.frame = 0
              ch.frameTimer = 0
              break
            }
          }
        }
        // Pick idle activity: 33% coffee, 33% smoking, 33% sofa
        const activityRoll = Math.random()
        if (activityRoll < COFFEE_BREAK_CHANCE) {
          const coffeeSpot = findFreeCoffeeSpot(placedFurniture, ch, allCharacters, tileMap, blockedTiles)
          if (coffeeSpot) {
            const coffeePath = findPath(ch.tileCol, ch.tileRow, coffeeSpot.col, coffeeSpot.row, tileMap, blockedTiles, doorTiles)
            if (coffeePath.length > 0) {
              ch.path = coffeePath
              ch.moveProgress = 0
              ch.state = CharacterState.WALK
              ch.frame = 0
              ch.frameTimer = 0
              ch.coffeeSpotTarget = coffeeSpot
              break
            }
          }
        } else if (activityRoll < COFFEE_BREAK_CHANCE + SMOKING_BREAK_CHANCE) {
          const smokingSpot = findFreeSmokingSpot(ch, allCharacters, tileMap, blockedTiles, walkableTiles)
          if (smokingSpot) {
            const smokingPath = findPath(ch.tileCol, ch.tileRow, smokingSpot.col, smokingSpot.row, tileMap, blockedTiles, doorTiles)
            if (smokingPath.length > 0) {
              ch.path = smokingPath
              ch.moveProgress = 0
              ch.state = CharacterState.WALK
              ch.frame = 0
              ch.frameTimer = 0
              ch.smokingSpotTarget = smokingSpot
              break
            }
          }
        }
        // Sofa (fallback or 33% roll)
        const loungeTarget = findFreeLoungeSeat(seats, ch, allCharacters, tileMap, blockedTiles)
        if (loungeTarget) {
          const path = findPath(ch.tileCol, ch.tileRow, loungeTarget.seatCol, loungeTarget.seatRow, tileMap, blockedTiles, doorTiles)
          if (path.length > 0) {
            ch.path = path
            ch.moveProgress = 0
            ch.state = CharacterState.WALK
            ch.frame = 0
            ch.frameTimer = 0
            ch.loungeTargetSeatId = loungeTarget.uid
            break
          }
        }
        // No activity available — wander
        ch.wanderTimer = WANDER_PAUSE_MIN_SEC
        ch.wanderCount = 0
        ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX)
      }
      break
    }

    case CharacterState.IDLE: {
      // No idle animation — static pose
      ch.frame = 0
      if (ch.seatTimer < 0) ch.seatTimer = 0 // safety: clear negative values
      // Tick coffee break timer (standing at coffee spot)
      if (ch.coffeeBreakTimer > 0) {
        ch.coffeeBreakTimer -= dt
        if (ch.coffeeBreakTimer > 0) break // still on break
        ch.coffeeBreakTimer = 0
      }
      // Tick smoking break timer (standing and smoking)
      if (ch.smokingBreakTimer > 0) {
        ch.smokingBreakTimer -= dt
        if (ch.smokingBreakTimer > 0) break // still on break
        ch.smokingBreakTimer = 0
      }
      // If leaving office, do nothing — just wait for deletion
      if (ch.leavingOffice) break
      // If became active, pathfind to seat
      if (ch.isActive) {
        if (!ch.seatId) {
          // No seat assigned — wander until one is assigned (don't freeze)
          if (ch.wanderTimer <= 0) {
            ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
          }
          // Fall through to wander logic below
        } else {
          const seat = seats.get(ch.seatId)
          if (!seat) {
            // Seat removed from layout — clear stale reference, wander
            ch.seatId = null
            if (ch.wanderTimer <= 0) {
              ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
            }
            // Fall through to wander logic below
          } else {
            const path = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles, doorTiles)
            if (path.length > 0) {
              ch.path = path
              ch.moveProgress = 0
              ch.state = CharacterState.WALK
              ch.frame = 0
              ch.frameTimer = 0
            } else if (ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              // Already at seat — sit down
              ch.state = CharacterState.TYPE
              ch.dir = seat.facingDir
              ch.frame = 0
              ch.frameTimer = 0
            } else {
              // Can't reach seat (blocked path) — stay idle, retry on next wander cycle
              ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
            }
            break
          }
        }
      }
      // Countdown wander timer
      ch.wanderTimer -= dt
      if (ch.wanderTimer <= 0) {
        // Idle agents: boss/lead prefers role-restricted seat; others seek lounge
        if (!ch.isActive) {
          // Boss/lead: walk to own role-restricted seat instead of sofa
          if (ch.seatId) {
            const ownSeat = seats.get(ch.seatId)
            if (ownSeat?.requiredRoles && (ch.tileCol !== ownSeat.seatCol || ch.tileRow !== ownSeat.seatRow)) {
              const ownPath = findPath(ch.tileCol, ch.tileRow, ownSeat.seatCol, ownSeat.seatRow, tileMap, blockedTiles, doorTiles)
              if (ownPath.length > 0) {
                ch.path = ownPath
                ch.moveProgress = 0
                ch.state = CharacterState.WALK
                ch.frame = 0
                ch.frameTimer = 0
                ch.wanderCount++
                ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
                break
              }
            }
          }
          // Pick idle activity: 33% coffee, 33% smoking, 33% sofa
          const actRoll = Math.random()
          if (actRoll < COFFEE_BREAK_CHANCE) {
            const coffeeSpot = findFreeCoffeeSpot(placedFurniture, ch, allCharacters, tileMap, blockedTiles)
            if (coffeeSpot) {
              const coffeePath = findPath(ch.tileCol, ch.tileRow, coffeeSpot.col, coffeeSpot.row, tileMap, blockedTiles, doorTiles)
              if (coffeePath.length > 0) {
                ch.path = coffeePath
                ch.moveProgress = 0
                ch.state = CharacterState.WALK
                ch.frame = 0
                ch.frameTimer = 0
                ch.coffeeSpotTarget = coffeeSpot
                break
              }
            }
          } else if (actRoll < COFFEE_BREAK_CHANCE + SMOKING_BREAK_CHANCE) {
            const smokingSpot = findFreeSmokingSpot(ch, allCharacters, tileMap, blockedTiles, walkableTiles)
            if (smokingSpot) {
              const smokingPath = findPath(ch.tileCol, ch.tileRow, smokingSpot.col, smokingSpot.row, tileMap, blockedTiles, doorTiles)
              if (smokingPath.length > 0) {
                ch.path = smokingPath
                ch.moveProgress = 0
                ch.state = CharacterState.WALK
                ch.frame = 0
                ch.frameTimer = 0
                ch.smokingSpotTarget = smokingSpot
                break
              }
            }
          }
          const loungeTarget = findFreeLoungeSeat(seats, ch, allCharacters, tileMap, blockedTiles)
          if (loungeTarget) {
            // Temporarily unblock lounge seat tile so BFS can reach it as destination
            const loungeKey = `${loungeTarget.seatCol},${loungeTarget.seatRow}`
            const wasBlocked = blockedTiles.has(loungeKey)
            blockedTiles.delete(loungeKey)
            const path = findPath(ch.tileCol, ch.tileRow, loungeTarget.seatCol, loungeTarget.seatRow, tileMap, blockedTiles, doorTiles)
            if (wasBlocked) blockedTiles.add(loungeKey)
            if (path.length > 0) {
              ch.path = path
              ch.moveProgress = 0
              ch.state = CharacterState.WALK
              ch.frame = 0
              ch.frameTimer = 0
              ch.loungeTargetSeatId = loungeTarget.uid
              break
            }
          }
        }
        // Subagent parent-gravitate behavior: when idle, walk toward parent
        if (ch.isSubagent && ch.parentAgentId !== null && allCharacters) {
          const parentCh = allCharacters.get(ch.parentAgentId)
          if (parentCh) {
            const dist = Math.abs(ch.tileCol - parentCh.tileCol) + Math.abs(ch.tileRow - parentCh.tileRow)
            if (dist > SUBAGENT_MAX_DISTANCE) {
              // Too far from parent — walk toward a tile near (but not on top of) parent
              const targetCol = parentCh.tileCol + randomInt(-SUBAGENT_MIN_DISTANCE, SUBAGENT_MIN_DISTANCE)
              const targetRow = parentCh.tileRow + randomInt(-SUBAGENT_MIN_DISTANCE, SUBAGENT_MIN_DISTANCE)
              const path = findPath(ch.tileCol, ch.tileRow, targetCol, targetRow, tileMap, blockedTiles, doorTiles)
              if (path.length > 0) {
                ch.path = path
                ch.moveProgress = 0
                ch.state = CharacterState.WALK
                ch.frame = 0
                ch.frameTimer = 0
                ch.wanderCount++
                ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
                break
              }
            }
          }
        }

        // Check if we've wandered enough — return to seat for a rest
        if (ch.wanderCount >= ch.wanderLimit && ch.seatId) {
          const seat = seats.get(ch.seatId)
          if (seat) {
            const path = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles, doorTiles)
            if (path.length > 0) {
              ch.path = path
              ch.moveProgress = 0
              ch.state = CharacterState.WALK
              ch.frame = 0
              ch.frameTimer = 0
              break
            }
          }
        }
        if (walkableTiles.length > 0) {
          // Subagents: bias random wander toward parent's area
          let target: { col: number; row: number }
          if (ch.isSubagent && ch.parentAgentId !== null && allCharacters) {
            const parentCh = allCharacters.get(ch.parentAgentId)
            if (parentCh && Math.random() < 0.6) {
              // 60% chance to pick a walkable tile near parent
              const nearTiles = walkableTiles.filter((t) => {
                const d = Math.abs(t.col - parentCh.tileCol) + Math.abs(t.row - parentCh.tileRow)
                return d >= SUBAGENT_MIN_DISTANCE && d <= SUBAGENT_MAX_DISTANCE
              })
              target = nearTiles.length > 0
                ? nearTiles[Math.floor(Math.random() * nearTiles.length)]
                : walkableTiles[Math.floor(Math.random() * walkableTiles.length)]
            } else {
              target = walkableTiles[Math.floor(Math.random() * walkableTiles.length)]
            }
          } else {
            target = walkableTiles[Math.floor(Math.random() * walkableTiles.length)]
          }
          const path = findPath(ch.tileCol, ch.tileRow, target.col, target.row, tileMap, blockedTiles, doorTiles)
          if (path.length > 0) {
            ch.path = path
            ch.moveProgress = 0
            ch.state = CharacterState.WALK
            ch.frame = 0
            ch.frameTimer = 0
            ch.wanderCount++
          }
        }
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
      }
      break
    }

    case CharacterState.WALK: {
      // Walk animation
      if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
        ch.frameTimer -= WALK_FRAME_DURATION_SEC
        ch.frame = (ch.frame + 1) % 4
      }

      if (ch.path.length === 0) {
        // Path complete — snap to tile center and transition
        const center = tileCenter(ch.tileCol, ch.tileRow)
        ch.x = center.x
        ch.y = center.y

        // If leaving office, stay put — officeState will handle deletion
        if (ch.leavingOffice) {
          ch.state = CharacterState.IDLE
          ch.frame = 0
          ch.frameTimer = 0
          break
        }

        if (ch.isActive) {
          if (!ch.seatId) {
            // No seat — stay standing idle (don't sit in air)
            ch.state = CharacterState.IDLE
            ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
          } else {
            const seat = seats.get(ch.seatId)
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.state = CharacterState.TYPE
              ch.dir = seat.facingDir
            } else {
              ch.state = CharacterState.IDLE
            }
          }
        } else {
          // Arrived at coffee spot — stand and take a break
          if (ch.coffeeSpotTarget) {
            if (ch.tileCol === ch.coffeeSpotTarget.col && ch.tileRow === ch.coffeeSpotTarget.row) {
              ch.state = CharacterState.IDLE
              ch.frame = 0
              ch.frameTimer = 0
              ch.coffeeBreakTimer = randomRange(COFFEE_BREAK_MIN_SEC, COFFEE_BREAK_MAX_SEC)
              ch.coffeeSpotTarget = null
              break
            }
            ch.coffeeSpotTarget = null // missed, fall through
          }
          // Arrived at smoking spot — stand and smoke
          if (ch.smokingSpotTarget) {
            if (ch.tileCol === ch.smokingSpotTarget.col && ch.tileRow === ch.smokingSpotTarget.row) {
              ch.state = CharacterState.IDLE
              ch.frame = 0
              ch.frameTimer = 0
              ch.smokingBreakTimer = randomRange(SMOKING_BREAK_MIN_SEC, SMOKING_BREAK_MAX_SEC)
              ch.smokingSpotTarget = null
              break
            }
            ch.smokingSpotTarget = null // missed, fall through
          }
          // Check if arrived at a lounge seat (sofa/bench) — sit and chill
          if (ch.loungeTargetSeatId) {
            const loungeSeat = seats.get(ch.loungeTargetSeatId)
            if (loungeSeat && ch.tileCol === loungeSeat.seatCol && ch.tileRow === loungeSeat.seatRow) {
              ch.state = CharacterState.TYPE
              ch.dir = loungeSeat.facingDir
              ch.frame = 0
              ch.frameTimer = 0
              ch.seatTimer = 9999 // sit on sofa until active again
              ch.loungeTargetSeatId = null
              break
            }
            ch.loungeTargetSeatId = null
          }
          // Check if arrived at assigned seat — sit down for a rest before wandering again
          if (ch.seatId) {
            const seat = seats.get(ch.seatId)
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.state = CharacterState.TYPE
              ch.dir = seat.facingDir
              if (!ch.isActive) {
                // Role-restricted seat (boss chair): stay like on sofa; regular desk: leave immediately
                ch.seatTimer = seat.requiredRoles ? 9999 : 0
              } else {
                ch.seatTimer = randomRange(SEAT_REST_MIN_SEC, SEAT_REST_MAX_SEC)
              }
              ch.wanderCount = 0
              ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX)
              ch.frame = 0
              ch.frameTimer = 0
              break
            }
          }
          ch.state = CharacterState.IDLE
          ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC)
        }
        ch.frame = 0
        ch.frameTimer = 0
        break
      }

      // Move toward next tile in path
      const nextTile = ch.path[0]
      ch.dir = directionBetween(ch.tileCol, ch.tileRow, nextTile.col, nextTile.row)

      ch.moveProgress += (WALK_SPEED_PX_PER_SEC / TILE_SIZE) * dt

      const fromCenter = tileCenter(ch.tileCol, ch.tileRow)
      const toCenter = tileCenter(nextTile.col, nextTile.row)
      const t = Math.min(ch.moveProgress, 1)
      ch.x = fromCenter.x + (toCenter.x - fromCenter.x) * t
      ch.y = fromCenter.y + (toCenter.y - fromCenter.y) * t

      if (ch.moveProgress >= 1) {
        // Arrived at next tile
        ch.tileCol = nextTile.col
        ch.tileRow = nextTile.row
        ch.x = toCenter.x
        ch.y = toCenter.y
        ch.path.shift()
        ch.moveProgress = 0

        // If became active while wandering, repath to seat (skip if leaving office)
        if (ch.isActive && ch.seatId && !ch.leavingOffice) {
          const seat = seats.get(ch.seatId)
          if (seat) {
            const lastStep = ch.path[ch.path.length - 1]
            if (!lastStep || lastStep.col !== seat.seatCol || lastStep.row !== seat.seatRow) {
              const newPath = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles, doorTiles)
              if (newPath.length > 0) {
                ch.path = newPath
              }
            }
          }
        }
      }
      break
    }
  }
}

/** Get the correct sprite frame for a character's current state and direction */
export function getCharacterSprite(ch: Character, sprites: CharacterSprites): SpriteData {
  switch (ch.state) {
    case CharacterState.TYPE:
      if (isReadingTool(ch.currentTool)) {
        return sprites.reading[ch.dir][ch.frame % 2]
      }
      return sprites.typing[ch.dir][ch.frame % 2]
    case CharacterState.WALK:
      return sprites.walk[ch.dir][ch.frame % 4]
    case CharacterState.IDLE:
      return sprites.walk[ch.dir][1]
    default:
      return sprites.walk[ch.dir][1]
  }
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}
