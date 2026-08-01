import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BottomToolbar } from './components/BottomToolbar.js'
import { HudScreen } from './components/HudScreen.js'
import { LeftSidebar } from './components/LeftSidebar.js'
import { RightSidebar } from './components/RightSidebar.js'
import { ZoomControls } from './components/ZoomControls.js'
import { isShareMode } from './wsApi.js'
import { useEditorActions } from './hooks/useEditorActions.js'
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js'
import { useExtensionMessages } from './hooks/useExtensionMessages.js'
import { OfficeCanvas } from './office/components/OfficeCanvas.js'
import { ToolOverlay } from './office/components/ToolOverlay.js'
import { EditorState } from './office/editor/editorState.js'
import { EditorToolbar } from './office/editor/EditorToolbar.js'
import { OfficeState } from './office/engine/officeState.js'
import { deserializeLayout, serializeLayout } from './office/layout/index.js'
import { isRotatable } from './office/layout/furnitureCatalog.js'
import { EditTool } from './office/types.js'
import { vscode } from './vscodeApi.js'

const officeStateRef = { current: null as OfficeState | null }
const editorState = new EditorState()

function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState()
  }
  return officeStateRef.current
}

const abCls = "px-2.5 py-1 text-[22px] bg-pixel-btn text-pixel-text-dim border-2 border-transparent cursor-pointer hover:bg-pixel-btn-hover leading-none"
const abDisabledCls = "px-2.5 py-1 text-[22px] bg-pixel-btn text-pixel-text-dim border-2 border-transparent cursor-default opacity-35 leading-none"
const abSaveCls = "px-2.5 py-1 text-[22px] bg-[rgba(46,160,67,0.22)] text-[#d7ffe0] border-2 border-[rgba(46,160,67,0.85)] cursor-pointer leading-none"
const abResetCls = "px-2.5 py-1 text-[22px] bg-[rgba(198,59,59,0.22)] text-[#ffd7d7] border-2 border-[rgba(198,59,59,0.85)] cursor-pointer leading-none"

function EditActionBar({ editor, editorState: es }: { editor: ReturnType<typeof useEditorActions>; editorState: EditorState }) {
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const undoDisabled = es.undoStack.length === 0
  const redoDisabled = es.redoStack.length === 0

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-controls flex gap-1 items-center bg-pixel-bg border-2 border-pixel-border px-2 py-1 shadow-pixel">
      <button className={undoDisabled ? abDisabledCls : abCls} onClick={undoDisabled ? undefined : editor.handleUndo} title="Undo (Ctrl+Z)">Undo</button>
      <button className={redoDisabled ? abDisabledCls : abCls} onClick={redoDisabled ? undefined : editor.handleRedo} title="Redo (Ctrl+Y)">Redo</button>
      <button className={abSaveCls} onClick={editor.handleSave} title="Save layout">Save</button>
      {!showResetConfirm ? (
        <button className={abResetCls} onClick={() => setShowResetConfirm(true)} title="Reset to last saved layout">Reset</button>
      ) : (
        <div className="flex gap-1 items-center">
          <span className="text-[22px] text-pixel-reset-text">Reset?</span>
          <button className={`${abCls} bg-pixel-danger text-white`} onClick={() => { setShowResetConfirm(false); editor.handleReset() }}>Yes</button>
          <button className={abCls} onClick={() => setShowResetConfirm(false)}>No</button>
        </div>
      )}
    </div>
  )
}

function App() {
  const editor = useEditorActions(getOfficeState, editorState)
  const isEditDirty = useCallback(() => editor.isEditMode && editor.isDirty, [editor.isEditMode, editor.isDirty])
  const { agents, selectedAgent, agentTools, agentStatuses, subagentTools, subagentCharacters, layoutReady, layoutWasReset, layoutBackupFileName, agentProviders, agentSessions, loadedAssets, githubTasks, agentStats, agentRoles, agentTeamInfo, agentDetails, requestAgentDetails, agentConversation, requestAgentConversation, pipelineIssues, sendMessages, serverMode, shareLink } = useExtensionMessages(getOfficeState, editor.setLastSavedLayout, isEditDirty)

  const [inspectedAgentId, setInspectedAgentId] = useState<number | null>(null)
  const handleInspectAgent = useCallback((agentId: number) => { setInspectedAgentId(agentId); requestAgentDetails(agentId); requestAgentConversation(agentId) }, [requestAgentDetails, requestAgentConversation])
  const handleControlAgent = useCallback((id: number, action: 'prompt' | 'approve' | 'deny' | 'interrupt', prompt: string | undefined, session: { pid?: number; processStartTime?: string; tmuxTarget?: string }) => {
    vscode.postMessage({ type: 'controlAgent', id, action, prompt, expectedPid: session.pid, expectedProcessStartTime: session.processStartTime, expectedTmuxTarget: session.tmuxTarget })
  }, [])
  const handleCloseInspection = useCallback(() => { setInspectedAgentId(null) }, [])

  const showMigrationNotice = layoutWasReset
  const [alwaysShowOverlay, setAlwaysShowOverlay] = useState(false)
  const [showTeamLines, setShowTeamLines] = useState(false)
  const [isHudOpen, setIsHudOpen] = useState(false)
  const shareMode = isShareMode()

  const isMobile = typeof window !== 'undefined' && (
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768)
  )

  const hudAgentsMap = useMemo(() => {
    const os = getOfficeState()
    const map = new Map<number, { name: string; status: string }>()
    for (const id of agents) {
      const ch = os.characters.get(id)
      map.set(id, { name: ch?.folderName || `agent-${id}`, status: agentStatuses[id] ?? 'active' })
    }
    return map
  }, [agents, agentStatuses])

  const handleToggleAlwaysShowOverlay = useCallback(() => setAlwaysShowOverlay((prev) => !prev), [])
  const officeState = getOfficeState()

  const handleExportLayout = useCallback(() => {
    const layout = officeState.getLayout()
    const blob = new Blob([serializeLayout(layout)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'pixel-agents-layout.json'
    document.body.appendChild(link); link.click(); link.remove()
    URL.revokeObjectURL(url)
  }, [officeState])

  const handleImportLayout = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      void file.text().then((text) => {
        const layout = deserializeLayout(text)
        if (!layout) { window.alert('Invalid layout JSON'); return }
        editor.handleImportLayout(layout)
      }).catch(() => { window.alert('Failed to read layout file') })
    }
    input.click()
  }, [editor])

  const containerRef = useRef<HTMLDivElement>(null)
  const [editorTickForKeyboard, setEditorTickForKeyboard] = useState(0)
  useEditorKeyboard(editor.isEditMode, editorState, editor.handleDeleteSelected, editor.handleRotateSelected, editor.handleToggleState, editor.handleUndo, editor.handleRedo, useCallback(() => setEditorTickForKeyboard((n) => n + 1), []), editor.handleToggleEditMode)

  const handleFitView = useCallback(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    editor.handleFitView(canvas.width, canvas.height)
  }, [editor])

  const handleCloseAgent = useCallback((id: number) => { vscode.postMessage({ type: 'closeAgent', id }) }, [])
  const handleClick = useCallback((agentId: number) => {
    const os = getOfficeState()
    const meta = os.subagentMeta.get(agentId)
    vscode.postMessage({ type: 'focusAgent', id: meta ? meta.parentAgentId : agentId })
  }, [])

  void editorTickForKeyboard

  const showRotateHint = editor.isEditMode && (() => {
    if (editorState.selectedFurnitureUid) {
      const item = officeState.getLayout().furniture.find((f) => f.uid === editorState.selectedFurnitureUid)
      if (item && isRotatable(item.type)) return true
    }
    if (editorState.activeTool === EditTool.FURNITURE_PLACE && isRotatable(editorState.selectedFurnitureType)) return true
    return false
  })()

  const didAutoFit = useRef(false)
  useEffect(() => {
    if (layoutReady && !didAutoFit.current) {
      didAutoFit.current = true
      requestAnimationFrame(() => handleFitView())
    }
  }, [layoutReady, handleFitView])

  if (shareMode && isMobile) {
    return (
      <div className="w-full h-full flex items-center justify-center flex-col gap-4 p-8 bg-pixel-bg text-pixel-text text-center">
        <div className="text-[48px]">🖥</div>
        <div className="text-[24px] max-w-[400px]">Отображение доступно только с desktop</div>
        <div className="text-[18px] text-white/40 max-w-[400px]">Откройте эту ссылку на компьютере для просмотра пиксельного офиса</div>
      </div>
    )
  }

  if (!layoutReady) {
    return <div className="w-full h-full flex items-center justify-center text-[color:var(--vscode-foreground)]">Loading...</div>
  }

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      <OfficeCanvas
        officeState={officeState} onClick={handleClick} onDoubleClick={handleInspectAgent}
        isEditMode={editor.isEditMode} editorState={editorState}
        onEditorSpawnAction={editor.handleSetAgentSpawn} onEditorTileAction={editor.handleEditorTileAction}
        onEditorEraseAction={editor.handleEditorEraseAction} onEditorSelectionChange={editor.handleEditorSelectionChange}
        onDeleteSelected={editor.handleDeleteSelected} onRotateSelected={editor.handleRotateSelected}
        onDragMove={editor.handleDragMove} editorTick={editor.editorTick}
        zoom={editor.zoom} onZoomChange={editor.handleZoomChange} panRef={editor.panRef} showTeamLines={showTeamLines}
      />
      {showMigrationNotice && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 bg-pixel-bg border-2 border-pixel-accent px-3 py-2 text-[18px] text-pixel-text shadow-pixel">
          <span>{layoutBackupFileName ? `Bundled layout updated. Backup: ${layoutBackupFileName}` : 'Bundled layout updated, but the previous layout backup was not created.'}</span>
          {layoutBackupFileName && <button className="px-2 py-1 bg-pixel-btn border-2 border-pixel-border cursor-pointer hover:bg-pixel-btn-hover" onClick={() => vscode.postMessage({ type: 'restoreLayoutBackup' })}>
            Restore backup
          </button>}
        </div>
      )}
      <ZoomControls zoom={editor.zoom} onZoomChange={editor.handleZoomChange} />

      {!editor.isEditMode && (
        <LeftSidebar agents={agents} agentTools={agentTools} agentStatuses={agentStatuses} agentStats={agentStats}
          agentRoles={agentRoles} agentTeamInfo={agentTeamInfo} agentProviders={agentProviders} agentSessions={agentSessions} onReattachAgent={(id) => vscode.postMessage({ type: 'reattachAgent', id })} onControlAgent={handleControlAgent} subagentCharacters={subagentCharacters}
          subagentTools={subagentTools} officeState={officeState} onInspectAgent={handleInspectAgent}
          pipelineIssues={pipelineIssues} githubTasks={githubTasks} serverMode={serverMode} isShareMode={isShareMode()} />
      )}
      {!editor.isEditMode && (
        <RightSidebar agents={agents} agentTools={agentTools} agentStatuses={agentStatuses} agentStats={agentStats}
          agentRoles={agentRoles} subagentCharacters={subagentCharacters} subagentTools={subagentTools}
          officeState={officeState} selectedAgentId={selectedAgent ?? inspectedAgentId ?? null}
          agentConversation={agentConversation} requestAgentConversation={requestAgentConversation}
          agentDetails={agentDetails} inspectedAgentId={inspectedAgentId} onCloseInspection={handleCloseInspection}
          sendMessages={sendMessages} />
      )}

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none z-[40]" style={{ background: 'var(--pixel-vignette)' }} />

      {!shareMode && (
        <HudScreen isOpen={isHudOpen} onClose={() => setIsHudOpen(false)} agents={hudAgentsMap} agentStats={agentStats} agentRoles={agentRoles} />
      )}

      {shareMode ? (
        <div className="absolute bottom-2.5 left-2.5 z-controls flex items-center gap-1 bg-pixel-bg border-2 border-pixel-border px-1.5 py-1 shadow-pixel">
          <button onClick={handleFitView} className="px-2.5 py-1.5 text-[24px] text-pixel-text bg-pixel-btn border-2 border-transparent cursor-pointer hover:bg-pixel-btn-hover" title="Fit office to view">Fit</button>
          <button onClick={() => setShowTeamLines(v => !v)}
            className={`px-2.5 py-1.5 text-[24px] text-pixel-text cursor-pointer ${showTeamLines ? 'bg-pixel-active border-2 border-pixel-accent' : 'bg-pixel-btn border-2 border-transparent hover:bg-pixel-btn-hover'}`}
            title="Show team group lines and clusters">Show teams</button>
        </div>
      ) : (
        <BottomToolbar isEditMode={editor.isEditMode} onToggleEditMode={editor.handleToggleEditMode}
          onExportLayout={handleExportLayout} onImportLayout={handleImportLayout}
          alwaysShowOverlay={alwaysShowOverlay} onToggleAlwaysShowOverlay={handleToggleAlwaysShowOverlay}
          showTeamLines={showTeamLines} onToggleShowTeamLines={() => setShowTeamLines(v => !v)}
          onFitView={handleFitView} isHudOpen={isHudOpen} onToggleHud={() => setIsHudOpen((v) => !v)} shareLink={shareLink} />
      )}

      {!shareMode && editor.isEditMode && editor.isDirty && <EditActionBar editor={editor} editorState={editorState} />}

      {showRotateHint && (
        <div className="absolute left-1/2 -translate-x-1/2 z-[49] bg-pixel-hint text-white text-[20px] px-2 py-[3px] border-2 border-pixel-accent shadow-pixel pointer-events-none whitespace-nowrap"
          style={{ top: editor.isDirty ? 52 : 8 }}>
          Rotate (R)
        </div>
      )}

      {editor.isEditMode && (() => {
        const selUid = editorState.selectedFurnitureUid
        const selColor = selUid ? officeState.getLayout().furniture.find((f) => f.uid === selUid)?.color ?? null : null
        return (
          <EditorToolbar activeTool={editorState.activeTool} selectedTileType={editorState.selectedTileType}
            selectedFurnitureType={editorState.selectedFurnitureType} selectedFurnitureUid={selUid}
            selectedFurnitureColor={selColor} agentSpawn={officeState.getLayout().agentSpawn}
            isSelectingSpawn={editorState.isSelectingSpawn} floorColor={editorState.floorColor}
            wallColor={editorState.wallColor} selectedWallSet={editorState.selectedWallSet}
            onToolChange={editor.handleToolChange} onToggleSpawnEdit={editor.handleToggleSpawnEdit}
            onClearAgentSpawn={editor.handleClearAgentSpawn} onTileTypeChange={editor.handleTileTypeChange}
            onFloorColorChange={editor.handleFloorColorChange} onWallColorChange={editor.handleWallColorChange}
            onWallSetChange={editor.handleWallSetChange} onSelectedFurnitureColorChange={editor.handleSelectedFurnitureColorChange}
            onFurnitureTypeChange={editor.handleFurnitureTypeChange} showCoords={editorState.showCoords}
            onToggleCoords={() => { editorState.showCoords = !editorState.showCoords }}
            showTypes={editorState.showTypes} onToggleTypes={() => { editorState.showTypes = !editorState.showTypes }}
            loadedAssets={loadedAssets} />
        )
      })()}

      <ToolOverlay officeState={officeState} agents={agents} agentTools={agentTools} agentStats={agentStats}
        agentRoles={agentRoles} subagentCharacters={subagentCharacters} containerRef={containerRef}
        zoom={editor.zoom} panRef={editor.panRef} onCloseAgent={handleCloseAgent} alwaysShowOverlay={alwaysShowOverlay} />
    </div>
  )
}

export default App
