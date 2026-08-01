import { useState } from 'react'
import { vscode } from '../vscodeApi.js'
import { isSoundEnabled, setSoundEnabled, isDesktopNotificationsEnabled, setDesktopNotificationsEnabled } from '../notificationSound.js'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onExportLayout: () => void
  onImportLayout: () => void
  alwaysShowOverlay: boolean
  onToggleAlwaysShowOverlay: () => void
  enabledCharacterIndexes: number[]
  onToggleCharacterIndex: (index: number) => void
}

const menuItemCls = "flex items-center justify-between w-full px-2.5 py-[6px] text-[24px] text-pixel-text bg-transparent border-0 cursor-pointer text-left hover:bg-pixel-btn"

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      className="w-3.5 h-3.5 border-2 border-white/50 shrink-0 flex items-center justify-center text-[12px] leading-none text-white"
      style={{ background: checked ? 'rgba(90, 140, 255, 0.8)' : 'transparent' }}
    >
      {checked ? 'X' : ''}
    </span>
  )
}

export function SettingsModal({
  isOpen,
  onClose,
  onExportLayout,
  onImportLayout,
  alwaysShowOverlay,
  onToggleAlwaysShowOverlay,
  enabledCharacterIndexes,
  onToggleCharacterIndex,
}: SettingsModalProps) {
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled)
  const [desktopNotifLocal, setDesktopNotifLocal] = useState(isDesktopNotificationsEnabled)

  if (!isOpen) return null

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-black/50 z-[190]" />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[191] bg-pixel-bg border-2 border-pixel-border p-1 shadow-pixel min-w-[200px]">
        <div className="flex items-center justify-between px-2.5 py-1 border-b border-pixel-border mb-1">
          <span className="text-[24px] text-white/90">Settings</span>
          <button
            onClick={onClose}
            className="bg-transparent border-0 text-white/60 text-[24px] cursor-pointer px-1 leading-none hover:bg-pixel-btn hover:text-pixel-close-hover"
          >
            X
          </button>
        </div>
        <button onClick={() => { onExportLayout(); onClose() }} className={menuItemCls}>
          Export Layout
        </button>
        <button onClick={() => { onImportLayout(); onClose() }} className={menuItemCls}>
          Import Layout
        </button>
        <button
          onClick={() => {
            const newVal = !isSoundEnabled()
            setSoundEnabled(newVal)
            setSoundLocal(newVal)
            vscode.postMessage({ type: 'saveSoundEnabled', enabled: newVal })
          }}
          className={menuItemCls}
        >
          <span>Sound Notifications</span>
          <Checkbox checked={soundLocal} />
        </button>
        <button
          onClick={() => {
            const newVal = !isDesktopNotificationsEnabled()
            setDesktopNotificationsEnabled(newVal)
            setDesktopNotifLocal(newVal)
            vscode.postMessage({ type: 'saveDesktopNotifications', enabled: newVal })
          }}
          className={menuItemCls}
        >
          <span>Desktop Notifications</span>
          <Checkbox checked={desktopNotifLocal} />
        </button>
        <button onClick={onToggleAlwaysShowOverlay} className={menuItemCls}>
          <span>Always Show Labels</span>
          <Checkbox checked={alwaysShowOverlay} />
        </button>
        <div className="px-2.5 py-1.5 border-t border-pixel-border">
          <div className="text-[18px] text-white/70 mb-1">Characters for new agents</div>
          <div className="flex gap-1 flex-wrap">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <button key={index} onClick={() => onToggleCharacterIndex(index)} className={`px-2 py-1 text-[18px] border-2 ${enabledCharacterIndexes.includes(index) ? 'border-pixel-accent text-pixel-accent' : 'border-pixel-border text-white/40'}`}>
                {index}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 p-2.5 border-t border-pixel-border border-pixel-border text-[20px] leading-[1.45] text-white/[0.78] max-w-[520px]">
          Проект поддерживается по личной инициативе и содержит баги, которые стараюсь оперативно
          исправлять. Если вам понравилось, то лучшая благодарность это подписка на канал:{' '}
          <a href="https://t.me/segagridchin" target="_blank" rel="noreferrer" className="text-pixel-accent no-underline">
            t.me/segagridchin
          </a>
        </div>
      </div>
    </>
  )
}
