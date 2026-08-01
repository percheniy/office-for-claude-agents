import type { FurnitureCatalogEntry, SpriteData } from '../types.js'
import { getFloorSprite, isFenceFloorPattern } from '../floorTiles.js'

export interface LoadedAssetData {
  catalog: Array<{
    id: string
    label: string
    category: string
    width: number
    height: number
    footprintW: number
    footprintH: number
    isDesk: boolean
    isDoor?: boolean
    groupId?: string
    orientation?: string // 'front' | 'back' | 'left' | 'right' | 'side'
    state?: string // 'on' | 'off'
    canPlaceOnSurfaces?: boolean
    backgroundTiles?: number
    canPlaceOnWalls?: boolean
    mirrorSide?: boolean
    rotationScheme?: string
    animationGroup?: string
    frame?: number
  }>
  sprites: Record<string, SpriteData>
}

export type FurnitureCategory =
  | 'desks'
  | 'chairs'
  | 'storage'
  | 'decor'
  | 'electronics'
  | 'fence'
  | 'wall'
  | 'misc'
  | (string & {})

export interface CatalogEntryWithCategory extends FurnitureCatalogEntry {
  category: FurnitureCategory
}

// ── Rotation groups ──────────────────────────────────────────────
// Flexible rotation: supports 2+ orientations (not just all 4)
interface RotationGroup {
  /** Ordered list of orientations available for this group */
  orientations: string[]
  /** Maps orientation → asset ID (for the default/off state) */
  members: Record<string, string>
}

// Maps any member asset ID → its rotation group
const rotationGroups = new Map<string, RotationGroup>()

// ── State groups ────────────────────────────────────────────────
// Maps asset ID → its on/off counterpart (symmetric for toggle)
const stateGroups = new Map<string, string>()
// Directional maps for getOnStateType / getOffStateType
const offToOn = new Map<string, string>() // off asset → on asset
const onToOff = new Map<string, string>() // on asset → off asset

// ── Animation groups ────────────────────────────────────────────
// Maps animation group ID → ordered list of asset IDs by frame index
const animationGroups = new Map<string, string[]>()

// Internal catalog (includes all variants for getCatalogEntry lookups)
let internalCatalog: CatalogEntryWithCategory[] | null = null

// Dynamic catalog built from loaded assets (when available)
// Only includes "front" variants for grouped items (shown in editor palette)
let dynamicCatalog: CatalogEntryWithCategory[] | null = null
let dynamicCategories: FurnitureCategory[] | null = null

const FENCE_FLOOR_TYPES = Array.from({ length: 17 }, (_, index) => 192 + index)

function getVirtualFenceEntries(): CatalogEntryWithCategory[] {
  const entries: CatalogEntryWithCategory[] = []
  for (const patternIndex of FENCE_FLOOR_TYPES) {
    if (!isFenceFloorPattern(patternIndex)) continue
    const sprite = getFloorSprite(patternIndex)
    if (!sprite) continue
    entries.push({
      type: `FLOOR_FENCE_${patternIndex}`,
      label: `Floor ${patternIndex}`,
      footprintW: 1,
      footprintH: 1,
      sprite,
      isDesk: false,
      category: 'fence',
    })
  }
  return entries.filter((_, index) => index !== 7 && index !== 8)
}

/**
 * Build catalog from loaded assets. Returns true if successful.
 * Once built, all getCatalog* functions use the dynamic catalog.
 * Uses ONLY custom assets (excludes hardcoded furniture when assets are loaded).
 */
export function buildDynamicCatalog(assets: LoadedAssetData): boolean {
  if (!assets?.catalog || !assets?.sprites) return false

  // Build all entries (including non-front variants)
  const allEntries = assets.catalog
    .map((asset): CatalogEntryWithCategory | null => {
      const sprite = assets.sprites[asset.id]
      if (!sprite) {
        console.warn(`No sprite data for asset ${asset.id}`)
        return null
      }
      return {
        type: asset.id,
        label: asset.label,
        footprintW: asset.footprintW,
        footprintH: asset.footprintH,
        sprite,
        isDesk: asset.isDesk,
        isDoor: !!asset.isDoor,
        category: asset.category as FurnitureCategory,
        ...(asset.orientation ? { orientation: asset.orientation } : {}),
        ...(asset.canPlaceOnSurfaces ? { canPlaceOnSurfaces: true } : {}),
        ...(asset.backgroundTiles ? { backgroundTiles: asset.backgroundTiles } : {}),
        ...(asset.canPlaceOnWalls ? { canPlaceOnWalls: true } : {}),
        ...(asset.mirrorSide ? { mirrorSide: true } : {}),
      }
    })
    .filter((e): e is CatalogEntryWithCategory => e !== null)

  // Create virtual ":left" entries for mirrorSide assets.
  // These share the same sprite but have a distinct type ID so rotation groups work.
  for (const asset of assets.catalog) {
    if (asset.mirrorSide && asset.orientation === 'side') {
      const sideEntry = allEntries.find((e) => e.type === asset.id)
      if (sideEntry) {
        allEntries.push({
          ...sideEntry,
          type: `${asset.id}:left`,
          orientation: 'left',
          mirrorSide: true,
        })
      }
    }
  }

  if (allEntries.length === 0) return false

  // Build rotation groups from groupId + orientation metadata
  rotationGroups.clear()
  stateGroups.clear()
  offToOn.clear()
  onToOff.clear()
  animationGroups.clear()

  // Phase 1: Collect orientations per group (only "off" or stateless variants for rotation)
  // For mirrorSide assets with orientation "side", register as both "right" and virtual "left"
  const groupMap = new Map<string, Map<string, string>>() // groupId → (orientation → assetId)
  for (const asset of assets.catalog) {
    if (asset.groupId && asset.orientation) {
      // For rotation groups, only use the "off" or stateless variant
      if (asset.state && asset.state !== 'off') continue
      let orientMap = groupMap.get(asset.groupId)
      if (!orientMap) {
        orientMap = new Map()
        groupMap.set(asset.groupId, orientMap)
      }

      if (asset.orientation === 'side') {
        // "side" is registered as "right" in the rotation group
        orientMap.set('right', asset.id)
        if (asset.mirrorSide) {
          // Register the virtual ":left" entry with a distinct type ID
          orientMap.set('left', `${asset.id}:left`)
        }
      } else {
        orientMap.set(asset.orientation, asset.id)
      }
    }
  }

  // For 2-way rotation schemes, "side" maps to "right" only (no left)
  // Check rotationScheme from assets
  const rotationSchemes = new Map<string, string>() // groupId → rotationScheme
  for (const asset of assets.catalog) {
    if (asset.groupId && asset.rotationScheme) {
      rotationSchemes.set(asset.groupId, asset.rotationScheme)
    }
  }

  // Phase 2: Register rotation groups with 2+ orientations
  const nonFrontIds = new Set<string>()
  const orientationOrder = ['front', 'right', 'back', 'left']
  for (const [groupId, orientMap] of groupMap) {
    if (orientMap.size < 2) continue
    const scheme = rotationSchemes.get(groupId)

    // For 2-way scheme, only use front and right (side)
    let allowedOrients = orientationOrder
    if (scheme === '2-way' || scheme === '2-way-mirror') {
      allowedOrients = ['front', 'right']
    }

    // Build ordered list of available orientations
    const orderedOrients = allowedOrients.filter((o) => orientMap.has(o))
    if (orderedOrients.length < 2) continue
    const members: Record<string, string> = {}
    for (const o of orderedOrients) {
      members[o] = orientMap.get(o)!
    }
    const rg: RotationGroup = { orientations: orderedOrients, members }
    // Register each unique asset ID in the rotation group
    const registeredIds = new Set<string>()
    for (const id of Object.values(members)) {
      if (!registeredIds.has(id)) {
        rotationGroups.set(id, rg)
        registeredIds.add(id)
      }
    }
    // Track non-front IDs to exclude from visible catalog
    for (const [orient, id] of Object.entries(members)) {
      if (orient !== 'front') nonFrontIds.add(id)
    }
  }

  // Phase 3: Build state groups (on ↔ off pairs within same groupId + orientation)
  const stateMap = new Map<string, Map<string, string>>() // "groupId|orientation" → (state → assetId)
  for (const asset of assets.catalog) {
    if (asset.groupId && asset.state) {
      const key = `${asset.groupId}|${asset.orientation || ''}`
      let sm = stateMap.get(key)
      if (!sm) {
        sm = new Map()
        stateMap.set(key, sm)
      }
      // For animation groups, use the first frame as the "on" representative
      if (asset.animationGroup && asset.frame !== undefined && asset.frame > 0) continue
      sm.set(asset.state, asset.id)
    }
  }
  for (const sm of stateMap.values()) {
    const onId = sm.get('on')
    const offId = sm.get('off')
    if (onId && offId) {
      stateGroups.set(onId, offId)
      stateGroups.set(offId, onId)
      offToOn.set(offId, onId)
      onToOff.set(onId, offId)
    }
  }

  // Also register rotation groups for "on" state variants (so rotation works on on-state items too)
  for (const asset of assets.catalog) {
    if (asset.groupId && asset.orientation && asset.state === 'on') {
      // Skip non-first animation frames
      if (asset.animationGroup && asset.frame !== undefined && asset.frame > 0) continue

      // Find the off-variant's rotation group
      const offCounterpart = stateGroups.get(asset.id)
      if (offCounterpart) {
        const offGroup = rotationGroups.get(offCounterpart)
        if (offGroup) {
          // Build an equivalent group for the "on" state
          const onMembers: Record<string, string> = {}
          for (const orient of offGroup.orientations) {
            const offId = offGroup.members[orient]
            const onId = stateGroups.get(offId)
            // Use on-state variant if available, otherwise fall back to off-state
            onMembers[orient] = onId ?? offId
          }
          const onGroup: RotationGroup = {
            orientations: offGroup.orientations,
            members: onMembers,
          }
          for (const id of Object.values(onMembers)) {
            if (!rotationGroups.has(id)) {
              rotationGroups.set(id, onGroup)
            }
          }
        }
      }
    }
  }

  // Phase 4: Build animation groups
  const animGroupCollector = new Map<string, Array<{ id: string; frame: number }>>()
  for (const asset of assets.catalog) {
    if (asset.animationGroup && asset.frame !== undefined) {
      let frames = animGroupCollector.get(asset.animationGroup)
      if (!frames) {
        frames = []
        animGroupCollector.set(asset.animationGroup, frames)
      }
      frames.push({ id: asset.id, frame: asset.frame })
    }
  }
  for (const [groupId, frames] of animGroupCollector) {
    frames.sort((a, b) => a.frame - b.frame)
    animationGroups.set(
      groupId,
      frames.map((f) => f.id),
    )
  }

  // Track "on" variant IDs and animation frame IDs (non-first) to exclude from visible catalog
  const onStateIds = new Set<string>()
  for (const asset of assets.catalog) {
    if (asset.state === 'on') onStateIds.add(asset.id)
  }

  // Store full internal catalog (all variants — for getCatalogEntry lookups)
  internalCatalog = allEntries

  // Visible catalog: exclude non-front variants and "on" state variants
  const visibleEntries = allEntries.filter(
    (e) => !nonFrontIds.has(e.type) && !onStateIds.has(e.type),
  )

  // Strip orientation/state suffix from labels for grouped variants
  for (const entry of visibleEntries) {
    if (rotationGroups.has(entry.type) || stateGroups.has(entry.type)) {
      entry.label = entry.label
        .replace(/ - Front - Off$/, '')
        .replace(/ - Front$/, '')
        .replace(/ - Off$/, '')
    }
  }

  dynamicCatalog = visibleEntries
  dynamicCategories = Array.from(new Set(visibleEntries.map((e) => e.category)))
    .filter((c): c is FurnitureCategory => !!c)
    .sort()

  const rotGroupCount = new Set(Array.from(rotationGroups.values())).size
  const animGroupCount = animationGroups.size
  console.log(
    `Built dynamic catalog with ${allEntries.length} assets (${visibleEntries.length} visible, ${rotGroupCount} rotation groups, ${stateGroups.size / 2} state pairs, ${animGroupCount} animation groups)`,
  )
  return true
}

export function getCatalogEntry(type: string): CatalogEntryWithCategory | undefined {
  if (type.startsWith('FLOOR_FENCE_')) {
    return getVirtualFenceEntries().find((e) => e.type === type)
  }
  // Check internal catalog (includes all variants, e.g., non-front rotations)
  if (internalCatalog) {
    return internalCatalog.find((e) => e.type === type)
  }
  return dynamicCatalog?.find((e) => e.type === type)
}

export function getCatalogByCategory(category: FurnitureCategory): CatalogEntryWithCategory[] {
  if (category === 'fence') {
    return getVirtualFenceEntries()
  }
  const catalog = dynamicCatalog ?? []
  if (category === 'hospital' || category === 'modern') {
    return []
  }
  const items = catalog.filter((e) => e.category === category)
  const kitchenTail = catalog.filter((e) => e.category === 'kitchen').slice(-6)
  const modernFirstItem = catalog.find((e) => e.category === 'modern')
  const modernMushroomLamp = catalog.find((e) => e.type === 'MI_MUSHROOM_LAMP_1')
  const modernSmallPainting = catalog.find((e) => e.type === 'MI_PAINTING_SM_1')
  const modernWindow2 = catalog.find((e) => e.type === 'MI_WINDOW_2')
  const plantsItems = [...catalog.filter((e) => e.category === 'plants'), ...(modernFirstItem ? [modernFirstItem] : [])]
  const plantsTail = plantsItems.slice(-3)

  if (category === 'desks' && items.length > 4) {
    // Show only original desk/table items, not MO_ series
    const originals = items.filter((e) => !e.type.startsWith('MO_'))
    return originals.length > 0 ? originals : items.slice(0, 4)
  }

  if (category === 'storage' && items.length > 10) {
    return [...items.slice(0, 10), ...(modernWindow2 ? [modernWindow2] : [])]
  }

  if (category === 'wall' && items.length > 5) {
    return [...items.slice(0, 5), ...items.slice(14)]
  }

  if (category === 'misc') {
    const miscBase = items.length > 18
      ? [...items.slice(0, 16), ...items.slice(-2)]
      : items
    return [
      ...miscBase,
      ...kitchenTail,
      ...(modernMushroomLamp ? [modernMushroomLamp] : []),
      ...(modernSmallPainting ? [modernSmallPainting] : []),
    ]
  }

  if (category === 'fireplace' && items.length >= 10) {
    return [items[1], items[9]].filter((item): item is CatalogEntryWithCategory => Boolean(item))
  }

  if (category === 'floor_decor' && items.length > 4) {
    return items.slice(0, 4)
  }

  if (category === 'kitchen' && items.length > 12) {
    return items.slice(0, 12)
  }

  if (category === 'lighting' && items.length > 6) {
    return items.slice(0, 6)
  }

  if (category === 'plants') {
    return plantsItems.slice(0, Math.max(0, plantsItems.length - 3))
  }

  if (category === 'money_decor') {
    return plantsTail
  }

  if (category === 'sofa' && items.length > 10) {
    return items.slice(10)
  }

  return items
}

export function getActiveCatalog(): CatalogEntryWithCategory[] {
  return dynamicCatalog ?? []
}

export function getActiveCategories(): Array<{ id: FurnitureCategory; label: string }> {
  const categories = (dynamicCategories ?? []).filter((c) => c !== 'hospital' && c !== 'modern')
  // Return known categories first (in preferred order), then any new ones
  const known = FURNITURE_CATEGORIES.filter((c) => categories.includes(c.id))
  const knownIds = new Set(FURNITURE_CATEGORIES.map((c) => c.id))
  const extra = categories
    .filter((c) => !knownIds.has(c))
    .map((id) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' ') }))
  const result = [...known, ...extra]
  if (getVirtualFenceEntries().length > 0 && !result.some((entry) => entry.id === 'fence')) {
    result.splice(4, 0, { id: 'fence', label: 'Fence' })
  }
  const plantsCount = (dynamicCatalog ?? []).filter((e) => e.category === 'plants').length
  if (plantsCount > 2) {
    result.push({ id: 'money_decor', label: 'Money Decor' })
  }
  return result
}

export const FURNITURE_CATEGORIES: Array<{ id: FurnitureCategory; label: string }> = [
  { id: 'desks', label: 'Desks' },
  { id: 'chairs', label: 'Chairs' },
  { id: 'storage', label: 'Storage' },
  { id: 'electronics', label: 'Tech' },
  { id: 'doors', label: 'Doors' },
  { id: 'fence', label: 'Fence' },
  { id: 'decor', label: 'Decor' },
  { id: 'wall', label: 'Wall' },
  { id: 'misc', label: 'Misc' },
]

// ── Rotation helpers ─────────────────────────────────────────────

/** Returns the next asset ID in the rotation group (cw or ccw), or null if not rotatable. */
export function getRotatedType(currentType: string, direction: 'cw' | 'ccw'): string | null {
  let type = currentType
  // Handle :left mirror suffix
  if (type.endsWith(':left')) {
    type = type.slice(0, -5)
  }
  const group = rotationGroups.get(type)
  if (!group) return null
  const order = group.orientations.map((o) => group.members[o])
  const idx = order.indexOf(type)
  if (idx === -1) return null
  const step = direction === 'cw' ? 1 : -1
  const nextIdx = (idx + step + order.length) % order.length
  return order[nextIdx]  // rotation always returns base type (no :left suffix)
}

/** Returns true if the given furniture type is a door (ANIM_DOOR variants). */
export function isDoorFurniture(type: string): boolean {
  if (type.startsWith('ANIM_DOOR')) return true
  // Check catalog isDoor flag as fallback
  const entry = getCatalogEntry(type)
  if (entry?.isDoor) return true
  return false
}

/** Returns the toggled state variant (on<->off), or null if no state variant exists. */
export function getToggledType(currentType: string): string | null {
  return stateGroups.get(currentType) ?? null
}

/** Returns the "on" variant if this type has one, otherwise returns the type unchanged.
 *  Handles :left mirror suffix transparently. */
export function getOnStateType(currentType: string): string {
  const direct = offToOn.get(currentType)
  if (direct) return direct
  // Handle :left mirror suffix
  if (currentType.endsWith(':left')) {
    const base = currentType.slice(0, -5)
    const baseOn = offToOn.get(base)
    if (baseOn) return baseOn + ':left'
  }
  return currentType
}

/** Returns the "off" variant if this type has one, otherwise returns the type unchanged.
 *  Handles :left mirror suffix transparently. */
export function getOffStateType(currentType: string): string {
  const direct = onToOff.get(currentType)
  if (direct) return direct
  if (currentType.endsWith(':left')) {
    const base = currentType.slice(0, -5)
    const baseOff = onToOff.get(base)
    if (baseOff) return baseOff + ':left'
  }
  return currentType
}

/** Returns true if the given furniture type is part of a rotation group. */
export function isRotatable(type: string): boolean {
  return rotationGroups.has(type)
}

/** Get ordered animation frame asset IDs for a given type, or null if not animated.
 *  Handles :left mirror suffix — returns frames with :left appended. */
export function getAnimationFrames(type: string): string[] | null {
  for (const [, frames] of animationGroups) {
    if (frames.includes(type)) return frames
  }
  // Handle :left suffix
  if (type.endsWith(':left')) {
    const base = type.slice(0, -5)
    for (const [, frames] of animationGroups) {
      if (frames.includes(base)) return frames.map(f => f + ':left')
    }
  }
  return null
}

/**
 * Get the orientation of a type within its rotation group, or undefined if not in a group.
 * Used by the renderer to determine if a "left" orientation should be mirrored.
 */
export function getOrientationInGroup(type: string): string | undefined {
  const group = rotationGroups.get(type)
  if (!group) return undefined
  for (const [orient, id] of Object.entries(group.members)) {
    if (id === type) return orient
  }
  return undefined
}
