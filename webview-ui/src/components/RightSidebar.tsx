/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { AgentStats, AgentRoleInfo, SubagentCharacter, ConversationMessage, AgentDetails } from '../hooks/useExtensionMessages.js'
import type { ToolActivity } from '../office/types.js'
import { ActivityFeed, MessagesView, bumpEntryId } from './sidebar/AgentEvents.js'
import type { ActivityEntry } from './sidebar/AgentEvents.js'
import { ConversationView, AgentDetailsView } from './sidebar/AgentChat.js'

interface RightSidebarProps {
  agents: number[]
  agentTools: Record<number, ToolActivity[]>
  agentStatuses: Record<number, string>
  agentStats: Map<number, AgentStats>
  agentRoles: Map<number, AgentRoleInfo>
  subagentCharacters: SubagentCharacter[]
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  officeState: OfficeState
  selectedAgentId: number | null
  agentConversation: { id: number; messages: ConversationMessage[] } | null
  requestAgentConversation: (id: number) => void
  agentDetails: AgentDetails | null
  inspectedAgentId: number | null
  onCloseInspection: () => void
  sendMessages: Array<{ id: number; from: string; to: string; message: string; timestamp: number }>
}

const tabCls = "flex-1 px-2 py-1 text-[18px] font-bold uppercase tracking-[0.5px] border-0 border-b-2 border-transparent cursor-pointer bg-transparent text-white/35 transition-colors duration-150"

export function RightSidebar({
  agents,
  agentTools,
  agentStatuses,
  agentRoles,
  subagentCharacters,
  subagentTools,
  officeState,
  selectedAgentId,
  agentConversation,
  requestAgentConversation,
  agentDetails,
  inspectedAgentId,
  onCloseInspection,
  sendMessages,
}: RightSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'activity' | 'messages' | 'chat'>('activity')
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const prevAgentsRef = useRef<number[]>([])
  const prevToolsRef = useRef<Record<number, ToolActivity[]>>({})
  const prevStatusesRef = useRef<Record<number, string>>({})
  const prevSubagentsRef = useRef<SubagentCharacter[]>([])
  const prevSubToolsRef = useRef<Record<number, Record<string, ToolActivity[]>>>({})
  const prevSendMessagesRef = useRef<Array<{ id: number; from: string; to: string; message: string; timestamp: number }>>([])

  useEffect(() => {
    const newEntries: ActivityEntry[] = []
    const now = Date.now()

    const getAgentName = (id: number) => {
      const ch = officeState.characters.get(id)
      return ch?.folderName || `agent-${id}`
    }

    for (const id of agents) {
      if (!prevAgentsRef.current.includes(id)) {
        newEntries.push({ id: bumpEntryId(), agentId: id, agentName: getAgentName(id), text: 'Joined the office', type: 'agent_joined', timestamp: now })
      }
    }
    for (const id of prevAgentsRef.current) {
      if (!agents.includes(id)) {
        newEntries.push({ id: bumpEntryId(), agentId: id, agentName: getAgentName(id), text: 'Left the office', type: 'agent_left', timestamp: now })
      }
    }
    for (const id of agents) {
      const tools = agentTools[id] || []
      const prevTools = prevToolsRef.current[id] || []
      for (const tool of tools) {
        const prevTool = prevTools.find((t) => t.toolId === tool.toolId)
        if (!prevTool) {
          newEntries.push({ id: bumpEntryId(), agentId: id, agentName: getAgentName(id), text: tool.status, type: 'tool_start', timestamp: now })
        } else if (tool.done && !prevTool.done) {
          newEntries.push({ id: bumpEntryId(), agentId: id, agentName: getAgentName(id), text: `Done: ${tool.status}`, type: 'tool_done', timestamp: now })
        } else if (tool.permissionWait && !prevTool.permissionWait) {
          newEntries.push({ id: bumpEntryId(), agentId: id, agentName: getAgentName(id), text: `Permission needed: ${tool.status}`, type: 'permission', timestamp: now })
        }
      }
    }
    for (const id of agents) {
      const status = agentStatuses[id]
      const prevStatus = prevStatusesRef.current[id]
      if (status && status !== prevStatus) {
        newEntries.push({ id: bumpEntryId(), agentId: id, agentName: getAgentName(id), text: status === 'waiting' ? 'Waiting for user input' : `Status: ${status}`, type: 'status', timestamp: now })
      }
    }
    for (const sub of subagentCharacters) {
      if (!prevSubagentsRef.current.some((s) => s.id === sub.id)) {
        newEntries.push({ id: bumpEntryId(), agentId: sub.parentAgentId, agentName: `${getAgentName(sub.parentAgentId)} > ${sub.label || 'subtask'}`, text: `Subagent spawned: ${sub.label || 'subtask'}`, type: 'sub_joined', timestamp: now, isSubagent: true })
      }
    }
    for (const sub of prevSubagentsRef.current) {
      if (!subagentCharacters.some((s) => s.id === sub.id)) {
        newEntries.push({ id: bumpEntryId(), agentId: sub.parentAgentId, agentName: `${getAgentName(sub.parentAgentId)} > ${sub.label || 'subtask'}`, text: `Subagent finished: ${sub.label || 'subtask'}`, type: 'sub_left', timestamp: now, isSubagent: true })
      }
    }
    for (const parentIdStr of Object.keys(subagentTools)) {
      const parentId = Number(parentIdStr)
      const agentSubs = subagentTools[parentId] || {}
      const prevAgentSubs = prevSubToolsRef.current[parentId] || {}
      for (const [parentToolId, tools] of Object.entries(agentSubs)) {
        const prevTools = prevAgentSubs[parentToolId] || []
        const subChar = subagentCharacters.find((s) => s.parentAgentId === parentId && s.parentToolId === parentToolId)
        const subLabel = subChar?.label || 'subtask'
        for (const tool of tools) {
          const prevTool = prevTools.find((t) => t.toolId === tool.toolId)
          if (!prevTool) {
            newEntries.push({ id: bumpEntryId(), agentId: parentId, agentName: `${getAgentName(parentId)} > ${subLabel}`, text: tool.status, type: 'sub_tool_start', timestamp: now, isSubagent: true })
          } else if (tool.done && !prevTool.done) {
            newEntries.push({ id: bumpEntryId(), agentId: parentId, agentName: `${getAgentName(parentId)} > ${subLabel}`, text: `Done: ${tool.status}`, type: 'sub_tool_done', timestamp: now, isSubagent: true })
          } else if (tool.permissionWait && !prevTool.permissionWait) {
            newEntries.push({ id: bumpEntryId(), agentId: parentId, agentName: `${getAgentName(parentId)} > ${subLabel}`, text: `Permission needed: ${tool.status}`, type: 'sub_permission', timestamp: now, isSubagent: true })
          }
        }
      }
    }
    const prevSendMsgCount = prevSendMessagesRef.current.length
    for (let i = prevSendMsgCount; i < sendMessages.length; i++) {
      const sm = sendMessages[i]
      newEntries.push({ id: bumpEntryId(), agentId: sm.id, agentName: sm.from, text: sm.message, type: 'send_message', timestamp: sm.timestamp, sendFrom: sm.from, sendTo: sm.to })
    }

    prevAgentsRef.current = [...agents]
    prevToolsRef.current = { ...agentTools }
    prevStatusesRef.current = { ...agentStatuses }
    prevSubagentsRef.current = [...subagentCharacters]
    prevSubToolsRef.current = { ...subagentTools }
    prevSendMessagesRef.current = sendMessages

    if (newEntries.length > 0) {
      setEntries((prev) => [...prev, ...newEntries].slice(-100))
    }
  }, [agents, agentTools, agentStatuses, subagentCharacters, subagentTools, officeState, sendMessages])

  useEffect(() => {
    if (inspectedAgentId !== null) setActiveTab('chat')
  }, [inspectedAgentId])

  useEffect(() => {
    if (activeTab === 'chat' && selectedAgentId !== null) requestAgentConversation(selectedAgentId)
  }, [activeTab, selectedAgentId, requestAgentConversation])

  useEffect(() => {
    if (scrollRef.current && (activeTab === 'activity' || activeTab === 'chat')) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, agentConversation?.messages.length, activeTab])

  const toggleCollapse = useCallback(() => setCollapsed((v) => !v), [])

  if (collapsed) {
    return (
      <div className="absolute top-2.5 right-2.5 bottom-[60px] z-sidebar flex flex-col items-center py-1.5 w-9 bg-pixel-bg border-2 border-pixel-border shadow-pixel overflow-hidden transition-[width] duration-200">
        <button onClick={toggleCollapse} className="px-1.5 py-0.5 text-[18px] text-pixel-text-dim bg-pixel-btn border-2 border-transparent cursor-pointer hover:bg-pixel-btn-hover" title="Expand sidebar">{'\u25C0'}</button>
        <div className="text-[16px] text-pixel-text-dim mt-2 tracking-[1px]" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
          ACTIVITY
        </div>
      </div>
    )
  }

  return (
    <div className="absolute top-2.5 right-2.5 bottom-[60px] z-sidebar flex flex-col w-[320px] bg-pixel-bg border-2 border-pixel-border shadow-pixel overflow-hidden transition-[width] duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b-2 border-pixel-border bg-white/[0.03] shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[18px] text-pixel-accent font-bold">
            {activeTab === 'activity' ? 'ACTIVITY' : activeTab === 'messages' ? 'MESSAGES' : 'CHAT'}
          </span>
          <span className="text-[14px] text-white/40">
            ({activeTab === 'activity' ? entries.length : activeTab === 'messages' ? sendMessages.length : agentConversation?.messages.length ?? 0})
          </span>
        </div>
        <button onClick={toggleCollapse} className="px-1.5 py-0.5 text-[18px] text-pixel-text-dim bg-pixel-btn border-2 border-transparent cursor-pointer hover:bg-pixel-btn-hover" title="Collapse sidebar">{'\u25B6'}</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b-2 border-pixel-border shrink-0">
        <button
          onClick={() => setActiveTab('activity')}
          className={tabCls}
          style={activeTab === 'activity' ? { color: '#ff9f43', borderBottomColor: '#ff9f43' } : undefined}
        >
          Events
        </button>
        <button
          onClick={() => setActiveTab('messages')}
          className={tabCls}
          style={activeTab === 'messages' ? { color: '#ffb347', borderBottomColor: '#ffb347' } : undefined}
        >
          Messages
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={tabCls}
          style={activeTab === 'chat' ? { color: '#e056fd', borderBottomColor: '#e056fd' } : undefined}
        >
          Chat
        </button>
      </div>

      {/* Content */}
      {activeTab === 'chat' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-1 min-h-0">
            <ConversationView
              messages={agentConversation?.id === selectedAgentId ? agentConversation.messages : []}
              selectedAgentId={selectedAgentId}
            />
          </div>
          {inspectedAgentId !== null && agentDetails && agentDetails.id === inspectedAgentId && (
            <AgentDetailsView
              details={agentDetails}
              folderName={officeState.characters.get(inspectedAgentId)?.folderName}
              onClose={onCloseInspection}
            />
          )}
        </div>
      ) : (
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-1">
        {activeTab === 'activity' ? (
          <ActivityFeed entries={entries} agentRoles={agentRoles} />
        ) : (
          <MessagesView messages={sendMessages} />
        )}
      </div>
      )}
    </div>
  )
}
