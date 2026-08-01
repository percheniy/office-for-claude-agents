import { useMemo, useState } from 'react'
import type { SessionHistoryItem } from '../../hooks/useExtensionMessages.js'
import { vscode } from '../../vscodeApi.js'

function formatAge(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function SessionPicker({ sessions, onClose }: { sessions: SessionHistoryItem[]; onClose: () => void }) {
  const [filter, setFilter] = useState('all')
  const filtered = useMemo(() => filter === 'all' ? sessions : sessions.filter((session) => session.state === filter), [filter, sessions])
  return (
    <div className="absolute inset-2 z-[70] bg-pixel-bg border-2 border-pixel-border shadow-pixel flex flex-col">
      <div className="flex items-center justify-between px-2 py-1.5 border-b-2 border-pixel-border">
        <span className="text-[18px] text-pixel-accent font-bold">SESSIONS</span>
        <button onClick={onClose} className="text-[18px] text-pixel-text-dim px-1">[X]</button>
      </div>
      <div className="flex items-center gap-1 px-2 py-1 border-b border-white/10">
        {['all', 'active', 'detached', 'completed', 'stale'].map((value) => <button key={value} onClick={() => setFilter(value)} className={`text-[11px] px-1.5 py-0.5 border ${filter === value ? 'border-pixel-accent text-pixel-accent' : 'border-pixel-border text-pixel-text-dim'}`}>{value}</button>)}
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {filtered.map((session) => (
          <div key={`${session.provider}:${session.sessionId}`} className="border border-white/10 px-2 py-1.5 mb-1 bg-white/[0.02]">
            <div className="flex items-center gap-1">
              <span className="text-[14px] text-pixel-text font-bold truncate flex-1">{session.title || session.projectName}</span>
              <span className="text-[10px] uppercase text-white/50">{session.provider}</span>
              <span className="text-[10px] uppercase text-white/50">{session.state}</span>
            </div>
            <div className="text-[11px] text-white/40 truncate" title={session.projectDir}>{session.projectDir} · {formatAge(session.lastActivity)}</div>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[10px] text-white/30 font-mono">{session.sessionId.slice(0, 12)} · {Math.round(session.sizeBytes / 1024)} KB</span>
              {session.resumable ? <button disabled={session.state === 'active'} onClick={() => vscode.postMessage({ type: 'resumeSession', session })} className="ml-auto text-[11px] px-1.5 py-0.5 border border-pixel-border text-pixel-text-dim disabled:opacity-40">{session.state === 'active' ? 'Active' : 'Resume'}</button> : <span className="ml-auto text-[10px] text-white/35">Read-only</span>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="p-4 text-center text-white/30 text-[14px]">No sessions</div>}
      </div>
    </div>
  )
}
