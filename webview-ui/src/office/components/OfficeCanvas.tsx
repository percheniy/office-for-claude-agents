import { useRef, useEffect, useCallback } from 'react'
import type { OfficeState } from '../engine/officeState.js'
import type { EditorState } from '../editor/editorState.js'
import type { EditorRenderState, SelectionRenderState, DeleteButtonBounds, RotateButtonBounds } from '../engine/renderer.js'
import { startGameLoop } from '../engine/gameLoop.js'
import { renderFrame } from '../engine/renderer.js'
import { TILE_SIZE, EditTool } from '../types.js'
import { CAMERA_FOLLOW_LERP, CAMERA_FOLLOW_SNAP_THRESHOLD, ZOOM_MIN, ZOOM_MAX, ZOOM_SENSITIVITY, PAN_MARGIN_FRACTION } from '../../constants.js'
import { getCatalogEntry, isRotatable } from '../layout/furnitureCatalog.js'
import { canPlaceFurniture, getWallPlacementRow, hitTestFurniture } from '../editor/editorActions.js'
import { isWalkable } from '../layout/tileMap.js'
import { vscode } from '../../vscodeApi.js'
import { unlockAudio } from '../../notificationSound.js'

interface OfficeCanvasProps {
  officeState: OfficeState
  onClick: (agentId: number) => void
  onDoubleClick?: (agentId: number) => void
  isEditMode: boolean
  editorState: EditorState
  onEditorSpawnAction: (col: number, row: number) => void
  onEditorTileAction: (col: number, row: number) => void
  onEditorEraseAction: (col: number, row: number) => void
  onEditorSelectionChange: () => void
  onDeleteSelected: () => void
  onRotateSelected: () => void
  onDragMove: (uid: string, newCol: number, newRow: number) => void
  editorTick: number
  zoom: number
  onZoomChange: (zoom: number) => void
  panRef: React.MutableRefObject<{ x: number; y: number }>
  showTeamLines?: boolean
}

export function OfficeCanvas({ officeState, onClick, onDoubleClick, isEditMode, editorState, onEditorSpawnAction, onEditorTileAction, onEditorEraseAction, onEditorSelectionChange, onDeleteSelected, onRotateSelected, onDragMove, editorTick: _editorTick, zoom, onZoomChange, panRef, showTeamLines }: OfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef({ x: 0, y: 0 })
  const showTeamLinesRef = useRef(showTeamLines)
  showTeamLinesRef.current = showTeamLines
  // Middle-mouse pan state (imperative, no re-renders)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })
  // Delete/rotate button bounds (updated each frame by renderer)
  const deleteButtonBoundsRef = useRef<DeleteButtonBounds | null>(null)
  const rotateButtonBoundsRef = useRef<RotateButtonBounds | null>(null)
  // Right-click erase dragging
  const isEraseDraggingRef = useRef(false)
  // Zoom scroll accumulator for trackpad pinch sensitivity

  // Clamp pan so the map edge can't go past a margin inside the viewport
  const clampPan = useCallback((px: number, py: number): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (!canvas) return { x: px, y: py }
    const layout = officeState.getLayout()
    const mapW = layout.cols * TILE_SIZE * zoom
    const mapH = layout.rows * TILE_SIZE * zoom
    const marginX = canvas.width * PAN_MARGIN_FRACTION
    const marginY = canvas.height * PAN_MARGIN_FRACTION
    const maxPanX = (mapW / 2) + canvas.width / 2 - marginX
    const maxPanY = (mapH / 2) + canvas.height / 2 - marginY
    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, px)),
      y: Math.max(-maxPanY, Math.min(maxPanY, py)),
    }
  }, [officeState, zoom])

  // Resize canvas backing store to device pixels (no DPR transform on ctx)
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    // No ctx.scale(dpr) — we render directly in device pixels
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    resizeCanvas()

    const observer = new ResizeObserver(() => resizeCanvas())
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    const stop = startGameLoop(canvas, {
      update: (dt) => {
        officeState.update(dt)
      },
      render: (ctx) => {
        // Canvas dimensions are in device pixels
        const w = canvas.width
        const h = canvas.height

        // Build editor render state
        let editorRender: EditorRenderState | undefined
        if (isEditMode) {
          const showGhostBorder = editorState.activeTool === EditTool.TILE_PAINT || editorState.activeTool === EditTool.WALL_PAINT || editorState.activeTool === EditTool.ERASE
          editorRender = {
            showGrid: true,
            showCoords: editorState.showCoords ?? false,
            showTypes: editorState.showTypes ?? false,
            typesData: (editorState.showTypes) ? {
              seats: new Map(Array.from(officeState.seats).map(([, s]) => [`${s.seatCol},${s.seatRow}`, { isLounge: s.isLounge }])),
              blockedTiles: officeState.blockedTiles,
              walkableTiles: new Set(officeState.walkableTiles.map(t => `${t.col},${t.row}`)),
            } : undefined,
            ghostSprite: null,
            ghostMirrored: false,
            ghostCol: editorState.ghostCol,
            ghostRow: editorState.ghostRow,
            ghostValid: editorState.ghostValid,
            selectedCol: 0,
            selectedRow: 0,
            selectedW: 0,
            selectedH: 0,
            hasSelection: false,
            isRotatable: false,
            deleteButtonBounds: null,
            rotateButtonBounds: null,
            showGhostBorder,
            ghostBorderHoverCol: showGhostBorder ? editorState.ghostCol : -999,
            ghostBorderHoverRow: showGhostBorder ? editorState.ghostRow : -999,
            showSpawnMarker: editorState.isSelectingSpawn,
            spawnCol: officeState.getLayout().agentSpawn?.col ?? -1,
            spawnRow: officeState.getLayout().agentSpawn?.row ?? -1,
            spawnHoverCol: editorState.spawnHoverCol,
            spawnHoverRow: editorState.spawnHoverRow,
            spawnHoverValid: editorState.spawnHoverCol >= 0 && editorState.spawnHoverRow >= 0
              ? isWalkable(editorState.spawnHoverCol, editorState.spawnHoverRow, officeState.tileMap, officeState.blockedTiles)
              : false,
          }

          // Ghost preview for furniture placement
          if (editorState.activeTool === EditTool.FURNITURE_PLACE && editorState.ghostCol >= 0) {
            const entry = getCatalogEntry(editorState.selectedFurnitureType)
            if (entry) {
              const placementRow = getWallPlacementRow(editorState.selectedFurnitureType, editorState.ghostRow)
              editorRender.ghostSprite = entry.sprite
              editorRender.ghostRow = placementRow
              editorRender.ghostMirrored = !!entry.mirrorSide && editorState.selectedFurnitureType.endsWith(':left')
              editorRender.ghostValid = canPlaceFurniture(
                officeState.getLayout(),
                editorState.selectedFurnitureType,
                editorState.ghostCol,
                placementRow,
              )
            }
          }

          // Ghost preview for drag-to-move
          if (editorState.isDragMoving && editorState.dragUid && editorState.ghostCol >= 0) {
            const draggedItem = officeState.getLayout().furniture.find((f) => f.uid === editorState.dragUid)
            if (draggedItem) {
              const entry = getCatalogEntry(draggedItem.type)
              if (entry) {
                const ghostCol = editorState.ghostCol - editorState.dragOffsetCol
                const ghostRow = editorState.ghostRow - editorState.dragOffsetRow
                editorRender.ghostSprite = entry.sprite
                editorRender.ghostCol = ghostCol
                editorRender.ghostRow = ghostRow
                editorRender.ghostMirrored = !!entry.mirrorSide && draggedItem.type.endsWith(':left')
                editorRender.ghostValid = canPlaceFurniture(
                  officeState.getLayout(),
                  draggedItem.type,
                  ghostCol,
                  ghostRow,
                  editorState.dragUid,
                )
              }
            }
          }

          // Selection highlight
          if (editorState.selectedFurnitureUid && !editorState.isDragMoving) {
            const item = officeState.getLayout().furniture.find((f) => f.uid === editorState.selectedFurnitureUid)
            if (item) {
              const entry = getCatalogEntry(item.type)
              if (entry) {
                // Use visual dimensions (sprite size) so selection box wraps the whole visual area
                const visualW = Math.ceil((entry.sprite[0]?.length ?? 0) / TILE_SIZE) || entry.footprintW
                const visualH = Math.ceil(entry.sprite.length / TILE_SIZE) || entry.footprintH
                editorRender.hasSelection = true
                editorRender.selectedCol = item.col
                editorRender.selectedRow = item.row
                editorRender.selectedW = visualW
                editorRender.selectedH = visualH
                editorRender.isRotatable = isRotatable(item.type)
              }
            }
          }
        }

        // Camera follow: smoothly center on followed agent
        if (officeState.cameraFollowId !== null) {
          const followCh = officeState.characters.get(officeState.cameraFollowId)
          if (followCh) {
            const layout = officeState.getLayout()
            const mapW = layout.cols * TILE_SIZE * zoom
            const mapH = layout.rows * TILE_SIZE * zoom
            const targetX = mapW / 2 - followCh.x * zoom
            const targetY = mapH / 2 - followCh.y * zoom
            const dx = targetX - panRef.current.x
            const dy = targetY - panRef.current.y
            if (Math.abs(dx) < CAMERA_FOLLOW_SNAP_THRESHOLD && Math.abs(dy) < CAMERA_FOLLOW_SNAP_THRESHOLD) {
              panRef.current = { x: targetX, y: targetY }
            } else {
              panRef.current = {
                x: panRef.current.x + dx * CAMERA_FOLLOW_LERP,
                y: panRef.current.y + dy * CAMERA_FOLLOW_LERP,
              }
            }
          }
        }

        // Build selection render state
        const selectionRender: SelectionRenderState = {
          selectedAgentId: officeState.selectedAgentId,
          hoveredAgentId: officeState.hoveredAgentId,
          hoveredTile: officeState.hoveredTile,
          seats: officeState.seats,
          characters: officeState.characters,
        }

        const { offsetX, offsetY } = renderFrame(
          ctx,
          w,
          h,
          officeState.tileMap,
          officeState.furniture,
          officeState.getCharacters(),
          zoom,
          panRef.current.x,
          panRef.current.y,
          selectionRender,
          editorRender,
          officeState.getLayout().tileColors,
          officeState.getLayout().cols,
          officeState.getLayout().rows,
          showTeamLinesRef.current,
        )
        offsetRef.current = { x: offsetX, y: offsetY }

        // Store delete/rotate button bounds for hit-testing
        deleteButtonBoundsRef.current = editorRender?.deleteButtonBounds ?? null
        rotateButtonBoundsRef.current = editorRender?.rotateButtonBounds ?? null
      },
    })

    return () => {
      stop()
      observer.disconnect()
    }
  }, [officeState, resizeCanvas, isEditMode, editorState, _editorTick, zoom, panRef])

  // Convert CSS mouse coords to world (sprite pixel) coords
  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      // CSS coords relative to canvas
      const cssX = clientX - rect.left
      const cssY = clientY - rect.top
      // Convert to device pixels
      const deviceX = cssX * dpr
      const deviceY = cssY * dpr
      // Convert to world (sprite pixel) coords
      const worldX = (deviceX - offsetRef.current.x) / zoom
      const worldY = (deviceY - offsetRef.current.y) / zoom
      return { worldX, worldY, screenX: cssX, screenY: cssY, deviceX, deviceY }
    },
    [zoom],
  )

  const screenToTile = useCallback(
    (clientX: number, clientY: number): { col: number; row: number } | null => {
      const pos = screenToWorld(clientX, clientY)
      if (!pos) return null
      const col = Math.floor(pos.worldX / TILE_SIZE)
      const row = Math.floor(pos.worldY / TILE_SIZE)
      const layout = officeState.getLayout()
      // In edit mode with floor/wall/erase tool, extend valid range by 1 for ghost border
      if (isEditMode && (editorState.activeTool === EditTool.TILE_PAINT || editorState.activeTool === EditTool.WALL_PAINT || editorState.activeTool === EditTool.ERASE)) {
        if (col < -1 || col > layout.cols || row < -1 || row > layout.rows) return null
        return { col, row }
      }
      if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows) return null
      return { col, row }
    },
    [screenToWorld, officeState, isEditMode, editorState],
  )

  // Check if device-pixel coords hit the delete button
  const hitTestDeleteButton = useCallback((deviceX: number, deviceY: number): boolean => {
    const bounds = deleteButtonBoundsRef.current
    if (!bounds) return false
    const dx = deviceX - bounds.cx
    const dy = deviceY - bounds.cy
    return (dx * dx + dy * dy) <= (bounds.radius + 2) * (bounds.radius + 2) // small padding
  }, [])

  // Check if device-pixel coords hit the rotate button
  const hitTestRotateButton = useCallback((deviceX: number, deviceY: number): boolean => {
    const bounds = rotateButtonBoundsRef.current
    if (!bounds) return false
    const dx = deviceX - bounds.cx
    const dy = deviceY - bounds.cy
    return (dx * dx + dy * dy) <= (bounds.radius + 2) * (bounds.radius + 2)
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Handle middle-mouse panning
      if (isPanningRef.current) {
        const dpr = window.devicePixelRatio || 1
        const dx = (e.clientX - panStartRef.current.mouseX) * dpr
        const dy = (e.clientY - panStartRef.current.mouseY) * dpr
        panRef.current = clampPan(
          panStartRef.current.panX + dx,
          panStartRef.current.panY + dy,
        )
        return
      }

      if (isEditMode) {
        const tile = screenToTile(e.clientX, e.clientY)
        editorState.clearSpawnHover()
        if (tile) {
          if (editorState.isSelectingSpawn) {
            editorState.spawnHoverCol = tile.col
            editorState.spawnHoverRow = tile.row
            editorState.ghostCol = -1
            editorState.ghostRow = -1
          } else {
            editorState.ghostCol = tile.col
            editorState.ghostRow = tile.row
          }

          // Drag-to-move: check if cursor moved to different tile
          if (editorState.dragUid && !editorState.isDragMoving) {
            if (tile.col !== editorState.dragStartCol || tile.row !== editorState.dragStartRow) {
              editorState.isDragMoving = true
            }
          }

          // Paint on drag (tile/wall/erase paint tool only, not during furniture drag)
          if (editorState.isDragging && (editorState.activeTool === EditTool.TILE_PAINT || editorState.activeTool === EditTool.WALL_PAINT || editorState.activeTool === EditTool.ERASE) && !editorState.dragUid) {
            onEditorTileAction(tile.col, tile.row)
          }
          // Right-click erase drag
          if (isEraseDraggingRef.current && (editorState.activeTool === EditTool.TILE_PAINT || editorState.activeTool === EditTool.WALL_PAINT || editorState.activeTool === EditTool.ERASE)) {
            const layout = officeState.getLayout()
            if (tile.col >= 0 && tile.col < layout.cols && tile.row >= 0 && tile.row < layout.rows) {
              onEditorEraseAction(tile.col, tile.row)
            }
          }
        } else {
          editorState.ghostCol = -1
          editorState.ghostRow = -1
        }

        // Cursor: show grab during drag, pointer over delete button, crosshair otherwise
        const canvas = canvasRef.current
        if (canvas) {
          if (editorState.isDragMoving) {
            canvas.style.cursor = 'grabbing'
          } else if (editorState.isSelectingSpawn) {
            const valid = tile ? isWalkable(tile.col, tile.row, officeState.tileMap, officeState.blockedTiles) : false
            canvas.style.cursor = valid ? 'pointer' : 'not-allowed'
          } else {
            const pos = screenToWorld(e.clientX, e.clientY)
            if (pos && (hitTestDeleteButton(pos.deviceX, pos.deviceY) || hitTestRotateButton(pos.deviceX, pos.deviceY))) {
              canvas.style.cursor = 'pointer'
            } else if (editorState.activeTool === EditTool.FURNITURE_PICK && tile) {
              // Pick mode: show pointer over furniture, crosshair elsewhere
              const layout = officeState.getLayout()
              const hitFurniture = layout.furniture.find((f) => {
                const entry = getCatalogEntry(f.type)
                if (!entry) return false
                return tile.col >= f.col && tile.col < f.col + entry.footprintW && tile.row >= f.row && tile.row < f.row + entry.footprintH
              })
              canvas.style.cursor = hitFurniture ? 'pointer' : 'crosshair'
            } else if ((editorState.activeTool === EditTool.SELECT || (editorState.activeTool === EditTool.FURNITURE_PLACE && editorState.selectedFurnitureType === '')) && tile) {
              // Check if hovering over furniture
              const layout = officeState.getLayout()
              const hitFurniture = layout.furniture.find((f) => {
                const entry = getCatalogEntry(f.type)
                if (!entry) return false
                return tile.col >= f.col && tile.col < f.col + entry.footprintW && tile.row >= f.row && tile.row < f.row + entry.footprintH
              })
              canvas.style.cursor = hitFurniture ? 'grab' : 'crosshair'
            } else {
              canvas.style.cursor = 'crosshair'
            }
          }
        }
        return
      }

      const pos = screenToWorld(e.clientX, e.clientY)
      if (!pos) return
      const hitId = officeState.getCharacterAt(pos.worldX, pos.worldY)
      const tile = screenToTile(e.clientX, e.clientY)
      officeState.hoveredTile = tile
      const canvas = canvasRef.current
      if (canvas) {
        let cursor = 'default'
        if (hitId !== null) {
          cursor = 'pointer'
        } else if (officeState.selectedAgentId !== null && tile) {
          // Check if hovering over a clickable seat (available or own)
          const seatId = officeState.getSeatAtTile(tile.col, tile.row)
          if (seatId) {
            const seat = officeState.seats.get(seatId)
            if (seat) {
              const selectedCh = officeState.characters.get(officeState.selectedAgentId)
              if (!seat.assigned || (selectedCh && selectedCh.seatId === seatId)) {
                cursor = 'pointer'
              }
            }
          }
        }
        canvas.style.cursor = cursor
      }
      officeState.hoveredAgentId = hitId
    },
    [officeState, screenToWorld, screenToTile, isEditMode, editorState, onEditorTileAction, onEditorEraseAction, panRef, hitTestDeleteButton, hitTestRotateButton, clampPan],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      unlockAudio()
      // Middle mouse button (button 1) starts panning
      if (e.button === 1) {
        e.preventDefault()
        // Break camera follow on manual pan
        officeState.cameraFollowId = null
        isPanningRef.current = true
        panStartRef.current = {
          mouseX: e.clientX,
          mouseY: e.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        }
        const canvas = canvasRef.current
        if (canvas) canvas.style.cursor = 'grabbing'
        return
      }

      // Right-click in edit mode for erasing
      if (e.button === 2 && isEditMode) {
        const tile = screenToTile(e.clientX, e.clientY)
        if (tile && (editorState.activeTool === EditTool.TILE_PAINT || editorState.activeTool === EditTool.WALL_PAINT || editorState.activeTool === EditTool.ERASE)) {
          const layout = officeState.getLayout()
          if (tile.col >= 0 && tile.col < layout.cols && tile.row >= 0 && tile.row < layout.rows) {
            isEraseDraggingRef.current = true
            onEditorEraseAction(tile.col, tile.row)
          }
        }
        return
      }

      if (!isEditMode) return

      if (editorState.isSelectingSpawn) {
        const tile = screenToTile(e.clientX, e.clientY)
        if (tile && isWalkable(tile.col, tile.row, officeState.tileMap, officeState.blockedTiles)) {
          onEditorSpawnAction(tile.col, tile.row)
        }
        return
      }

      // Check rotate/delete button hit first
      const pos = screenToWorld(e.clientX, e.clientY)
      if (pos && hitTestRotateButton(pos.deviceX, pos.deviceY)) {
        onRotateSelected()
        return
      }
      if (pos && hitTestDeleteButton(pos.deviceX, pos.deviceY)) {
        onDeleteSelected()
        return
      }

      const tile = screenToTile(e.clientX, e.clientY)

      // SELECT tool (or furniture tool with nothing selected): check for furniture hit to start drag
      const actAsSelect = editorState.activeTool === EditTool.SELECT ||
        (editorState.activeTool === EditTool.FURNITURE_PLACE && editorState.selectedFurnitureType === '')
      if (actAsSelect && tile) {
        const layout = officeState.getLayout()
        // Find all furniture at clicked tile (using visual area, not just footprint),
        // prefer surface items (on top of desks)
        let hitFurniture = null as typeof layout.furniture[0] | null
        for (const f of layout.furniture) {
          const entry = getCatalogEntry(f.type)
          if (!entry) continue
          if (hitTestFurniture(tile.col, tile.row, f, entry)) {
            if (!hitFurniture || entry.canPlaceOnSurfaces) hitFurniture = f
          }
        }
        if (hitFurniture) {
          // Start drag — record offset from furniture's top-left
          editorState.startDrag(
            hitFurniture.uid,
            tile.col,
            tile.row,
            tile.col - hitFurniture.col,
            tile.row - hitFurniture.row,
          )
          return
        } else {
          // Clicked empty space — deselect
          editorState.clearSelection()
          onEditorSelectionChange()
        }
      }

      // Non-select tools: start paint drag
      editorState.isDragging = true
      if (tile) {
        onEditorTileAction(tile.col, tile.row)
      }
    },
    [officeState, isEditMode, editorState, screenToTile, screenToWorld, onEditorSpawnAction, onEditorTileAction, onEditorEraseAction, onEditorSelectionChange, onDeleteSelected, onRotateSelected, hitTestDeleteButton, hitTestRotateButton, panRef],
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        isPanningRef.current = false
        const canvas = canvasRef.current
        if (canvas) canvas.style.cursor = isEditMode ? 'crosshair' : 'default'
        return
      }
      if (e.button === 2) {
        isEraseDraggingRef.current = false
        return
      }

      // Handle drag-to-move completion
      if (editorState.dragUid) {
        if (editorState.isDragMoving) {
          // Compute target position
          const ghostCol = editorState.ghostCol - editorState.dragOffsetCol
          const ghostRow = editorState.ghostRow - editorState.dragOffsetRow
          const draggedItem = officeState.getLayout().furniture.find((f) => f.uid === editorState.dragUid)
          if (draggedItem) {
            const valid = canPlaceFurniture(
              officeState.getLayout(),
              draggedItem.type,
              ghostCol,
              ghostRow,
              editorState.dragUid,
            )
            if (valid) {
              onDragMove(editorState.dragUid, ghostCol, ghostRow)
            }
          }
          editorState.clearSelection()
        } else {
          // Click (no movement) — toggle selection
          if (editorState.selectedFurnitureUid === editorState.dragUid) {
            editorState.clearSelection()
          } else {
            editorState.selectedFurnitureUid = editorState.dragUid
          }
        }
        editorState.clearDrag()
        onEditorSelectionChange()
        const canvas = canvasRef.current
        if (canvas) canvas.style.cursor = 'crosshair'
        return
      }

      editorState.isDragging = false
      editorState.wallDragAdding = null
    },
    [editorState, isEditMode, officeState, onDragMove, onEditorSelectionChange],
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isEditMode) return // handled by mouseDown/mouseUp
      const pos = screenToWorld(e.clientX, e.clientY)
      if (!pos) return

      const hitId = officeState.getCharacterAt(pos.worldX, pos.worldY)
      if (hitId !== null) {
        // Dismiss any active bubble on click
        officeState.dismissBubble(hitId)
        // Toggle selection: click same agent deselects, different agent selects
        if (officeState.selectedAgentId === hitId) {
          officeState.selectedAgentId = null
          officeState.cameraFollowId = null
        } else {
          officeState.selectedAgentId = hitId
          officeState.cameraFollowId = hitId
        }
        onClick(hitId) // still focus terminal
        return
      }

      // No agent hit — check seat click while agent is selected
      if (officeState.selectedAgentId !== null) {
        const selectedCh = officeState.characters.get(officeState.selectedAgentId)
        // Skip seat reassignment for sub-agents
        if (selectedCh && !selectedCh.isSubagent) {
          const tile = screenToTile(e.clientX, e.clientY)
          if (tile) {
            const seatId = officeState.getSeatAtTile(tile.col, tile.row)
            if (seatId) {
              const seat = officeState.seats.get(seatId)
              if (seat && selectedCh) {
                if (selectedCh.seatId === seatId) {
                  // Clicked own seat — send agent back to it
                  officeState.sendToSeat(officeState.selectedAgentId)
                  officeState.selectedAgentId = null
                  officeState.cameraFollowId = null
                  return
                } else if (!seat.assigned) {
                  // Clicked available seat — reassign
                  officeState.reassignSeat(officeState.selectedAgentId, seatId)
                  officeState.selectedAgentId = null
                  officeState.cameraFollowId = null
                  // Persist seat assignments (exclude sub-agents)
                  const seats: Record<number, { palette: number; seatId: string | null }> = {}
                  for (const ch of officeState.characters.values()) {
                    if (ch.isSubagent) continue
                    seats[ch.id] = { palette: ch.palette, seatId: ch.seatId }
                  }
                  vscode.postMessage({ type: 'saveAgentSeats', seats })
                  return
                }
              }
            }
          }
        }
        // Clicked empty space — deselect
        officeState.selectedAgentId = null
        officeState.cameraFollowId = null
      }
    },
    [officeState, onClick, screenToWorld, screenToTile, isEditMode],
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isEditMode || !onDoubleClick) return
      const pos = screenToWorld(e.clientX, e.clientY)
      if (!pos) return
      const hitId = officeState.getCharacterAt(pos.worldX, pos.worldY)
      if (hitId !== null) {
        // For sub-agents, inspect the parent
        const meta = officeState.subagentMeta.get(hitId)
        const inspectId = meta ? meta.parentAgentId : hitId
        onDoubleClick(inspectId)
      }
    },
    [officeState, screenToWorld, isEditMode, onDoubleClick],
  )

  const handleMouseLeave = useCallback(() => {
    isPanningRef.current = false
    isEraseDraggingRef.current = false
    editorState.isDragging = false
    editorState.wallDragAdding = null
    editorState.clearDrag()
    editorState.ghostCol = -1
    editorState.ghostRow = -1
    officeState.hoveredAgentId = null
    officeState.hoveredTile = null
  }, [officeState, editorState])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (isEditMode) return
    // Right-click to walk selected agent to tile
    if (officeState.selectedAgentId !== null) {
      const tile = screenToTile(e.clientX, e.clientY)
      if (tile) {
        officeState.walkToTile(officeState.selectedAgentId, tile.col, tile.row)
      }
    }
  }, [isEditMode, officeState, screenToTile])

  // Wheel: Ctrl+wheel to zoom, plain wheel/trackpad to pan
  // Must use native listener with { passive: false } to actually prevent browser zoom
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const onZoomChangeRef = useRef(onZoomChange)
  onZoomChangeRef.current = onZoomChange
  const clampPanRef = useRef(clampPan)
  clampPanRef.current = clampPan

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        // Smooth multiplicative zoom from trackpad pinch / ctrl+scroll
        const factor = Math.pow(2, -e.deltaY * ZOOM_SENSITIVITY)
        const curZoom = zoomRef.current
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, curZoom * factor))
        if (newZoom !== curZoom) {
          onZoomChangeRef.current(newZoom)
        }
      } else {
        // Pan via trackpad two-finger scroll or mouse wheel
        const dpr = window.devicePixelRatio || 1
        officeState.cameraFollowId = null
        panRef.current = clampPanRef.current(
          panRef.current.x - e.deltaX * dpr,
          panRef.current.y - e.deltaY * dpr,
        )
      }
    }

    // Block browser zoom on canvas
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    // Also block browser zoom globally (pinch events outside canvas area)
    const blockBrowserZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault()
    }
    document.addEventListener('wheel', blockBrowserZoom, { passive: false })
    return () => {
      canvas.removeEventListener('wheel', handleWheel)
      document.removeEventListener('wheel', blockBrowserZoom)
    }
  }, [officeState, panRef])

  // Prevent default middle-click browser behavior (auto-scroll)
  const handleAuxClick = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) e.preventDefault()
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: '#1E1E2E',
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onAuxClick={handleAuxClick}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        style={{ display: 'block' }}
      />
    </div>
  )
}
