import { useState } from 'react'
import { SettingsModal } from './SettingsModal.js'
import { vscode } from '../vscodeApi.js'

interface BottomToolbarProps {
  isEditMode: boolean
  onToggleEditMode: () => void
  onExportLayout: () => void
  onImportLayout: () => void
  alwaysShowOverlay: boolean
  onToggleAlwaysShowOverlay: () => void
  showTeamLines: boolean
  onToggleShowTeamLines: () => void
  onFitView: () => void
  isHudOpen: boolean
  onToggleHud: () => void
  shareLink: { url: string; expiresAt: number } | null
  enabledCharacterIndexes: number[]
  onToggleCharacterIndex: (index: number) => void
}

const btnCls = "px-2.5 py-[5px] text-[24px] text-pixel-text bg-pixel-btn border-2 border-transparent cursor-pointer hover:bg-pixel-btn-hover"
const btnActiveCls = "px-2.5 py-[5px] text-[24px] text-pixel-text bg-pixel-active border-2 border-pixel-accent cursor-pointer"

export function BottomToolbar({
  isEditMode,
  onToggleEditMode,
  onExportLayout,
  onImportLayout,
  alwaysShowOverlay,
  onToggleAlwaysShowOverlay,
  showTeamLines,
  onToggleShowTeamLines,
  onFitView,
  isHudOpen,
  onToggleHud,
  shareLink,
  enabledCharacterIndexes,
  onToggleCharacterIndex,
}: BottomToolbarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(Date.now())

  // Tick countdown when share link is active
  if (shareLink && Date.now() - now > 1000) {
    setTimeout(() => setNow(Date.now()), 100)
  }

  const remaining = shareLink ? Math.max(0, Math.ceil((shareLink.expiresAt - now) / 1000)) : 0
  const shareUrl = (shareLink && remaining > 0) ? shareLink.url : null
  const shareMinutes = Math.floor(remaining / 60)
  const shareSeconds = remaining % 60

  return (
    <>
    <div className="absolute bottom-2.5 left-2.5 z-controls flex items-center gap-1 bg-pixel-bg border-2 border-pixel-border px-1.5 py-1 shadow-pixel">
      <button
        onClick={onToggleEditMode}
        className={isEditMode ? btnActiveCls : btnCls}
        title="Edit office layout"
      >
        Layout
      </button>
      <button
        onClick={() => setIsSettingsOpen((v) => !v)}
        className={isSettingsOpen ? btnActiveCls : btnCls}
        title="Settings"
      >
        Settings
      </button>
      <button
        onClick={onFitView}
        className={btnCls}
        title="Fit office to view"
      >
        Fit
      </button>
      <button
        onClick={onToggleHud}
        className={isHudOpen ? btnActiveCls : btnCls}
        title="Heads-Up Display"
      >
        HUD
      </button>
      <button
        onClick={() => setIsShareOpen((v) => !v)}
        className={isShareOpen || shareUrl ? btnActiveCls : btnCls}
        style={isShareOpen || shareUrl ? { color: shareUrl ? 'var(--pixel-green)' : undefined } : undefined}
        title="Share office with friends"
      >
        Share
      </button>
      <button
        onClick={onToggleShowTeamLines}
        className={showTeamLines ? btnActiveCls : btnCls}
        title="Show team group lines and clusters"
      >
        Show teams
      </button>
    </div>

    {/* Modals rendered OUTSIDE toolbar to escape stacking context */}
    <SettingsModal
      isOpen={isSettingsOpen}
      onClose={() => setIsSettingsOpen(false)}
      onExportLayout={onExportLayout}
      onImportLayout={onImportLayout}
      alwaysShowOverlay={alwaysShowOverlay}
      onToggleAlwaysShowOverlay={onToggleAlwaysShowOverlay}
      enabledCharacterIndexes={enabledCharacterIndexes}
      onToggleCharacterIndex={onToggleCharacterIndex}
    />

    {isShareOpen && (
      <>
        <div
          onClick={() => setIsShareOpen(false)}
          className="fixed inset-0 z-[190]"
        />
        <div className="fixed bottom-[60px] left-2.5 z-[191] bg-pixel-bg border-2 border-pixel-border p-2 shadow-pixel min-w-[260px] min-w-[260px]">
          <div className="text-[18px] text-white/50 mb-1.5 font-bold">
            SHARE OFFICE
          </div>
          {shareUrl ? (
            <div>
              <div className="text-[14px] text-pixel-green break-all mb-1.5 px-1.5 py-1 bg-[rgba(90,200,140,0.08)] border border-[rgba(90,200,140,0.2)]">
                {shareUrl}
              </div>
              <div className="text-[16px] text-white/60 mb-1.5">
                Expires in {shareMinutes}:{shareSeconds.toString().padStart(2, '0')}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className={`flex-1 text-center text-[16px] px-2.5 py-[5px] border-2 border-transparent cursor-pointer ${
                    copied ? 'bg-pixel-agent-bg text-pixel-green' : 'bg-pixel-btn text-pixel-text hover:bg-pixel-btn-hover'
                  }`}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  className="flex-1 text-center text-[16px] px-2.5 py-[5px] bg-pixel-btn border-2 border-transparent cursor-pointer text-pixel-close-hover hover:bg-pixel-btn-hover"
                  onClick={() => {
                    const token = shareUrl.split('/').pop()
                    vscode.postMessage({ type: 'revokeShareLink', token })
                  }}
                >
                  Revoke
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1">
              <button
                onClick={() => vscode.postMessage({ type: 'createShareLink', durationMs: 600000 })}
                className={`${btnCls} text-[16px] flex-1 text-center`}
              >
                10 min
              </button>
              <button
                onClick={() => vscode.postMessage({ type: 'createShareLink', durationMs: 3600000 })}
                className={`${btnCls} text-[16px] flex-1 text-center`}
              >
                60 min
              </button>
            </div>
          )}
        </div>
      </>
    )}
    </>
  )
}
