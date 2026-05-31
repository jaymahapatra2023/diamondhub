// E10 · Team messaging — Announcements + Group Chat tabs, real-time via Socket.io
import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth.store.js'
import { messageApi } from '../api/message.api.js'
import { apiClient } from '../api/client.js'
import { MessageBubble } from '../components/messaging/MessageBubble.js'
import { AnnouncementCard } from '../components/messaging/AnnouncementCard.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  body: string
  senderId: string
  senderName: string
  senderInitials: string
  sentAt: string
  isDeleted?: boolean
}

interface Announcement {
  id: string
  title: string
  body: string
  authorName: string
  createdAt: string
  isPinned: boolean
}

type Tab = 'announcements' | 'chat'

// ── NewAnnouncementSheet ──────────────────────────────────────────────────────

interface NewAnnouncementSheetProps {
  isOpen: boolean
  teamId: string
  onClose: () => void
  onSaved: () => void
}

function NewAnnouncementSheet({ isOpen, teamId, onClose, onSaved }: NewAnnouncementSheetProps) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const mutation = useMutation({
    mutationFn: () => messageApi.createAnnouncement(teamId, { title, body }),
    onSuccess: () => {
      setTitle('')
      setBody('')
      onSaved()
    },
  })

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New announcement"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-gray-900 rounded-t-3xl px-4 pt-5 pb-safe-bottom w-full max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">New Announcement</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label htmlFor="ann-title" className="block text-sm font-medium text-gray-300 mb-1.5">
              Title
            </label>
            <input
              id="ann-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="ann-body" className="block text-sm font-medium text-gray-300 mb-1.5">
              Message
            </label>
            <textarea
              id="ann-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your announcement…"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={!title.trim() || !body.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="w-full h-12 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {mutation.isPending ? 'Posting…' : 'Post Announcement'}
        </button>

        <div className="pb-6" />
      </div>
    </div>
  )
}

// ── MessagesPage ──────────────────────────────────────────────────────────────

export function MessagesPage() {
  const { user, activeRole } = useAuthStore()
  const isCoach = activeRole?.role === 'COACH'
  const teamId = activeRole?.teamId ?? ''
  const myUserId = user?.id ?? ''

  const [activeTab, setActiveTab] = useState<Tab>('announcements')
  const [inputValue, setInputValue] = useState('')
  const [newAnnOpen, setNewAnnOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const socketRef = useRef<any>(null)
  const qc = useQueryClient()

  // ── Scroll to bottom when messages change ────────────────────────────────
  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, activeTab])

  // ── Socket.io real-time connection for Group Chat ─────────────────────────
  useEffect(() => {
    if (activeTab !== 'chat' || !teamId) return
    let socket: any

    const connect = async () => {
      const { io } = await import('socket.io-client')
      socket = io(import.meta.env.VITE_API_URL ?? window.location.origin, {
        transports: ['websocket', 'polling'],
      })
      socket.on('connect', () => {
        socket.emit('join:team', teamId)
      })
      socket.on('message:new', () => {
        qc.invalidateQueries({ queryKey: ['team-messages', teamId] })
      })
      socketRef.current = socket
    }

    void connect()
    return () => { socket?.disconnect(); socketRef.current = null }
  }, [teamId, activeTab])

  // ── Announcements query ───────────────────────────────────────────────────
  const { data: announcements = [], isLoading: annLoading } = useQuery<Announcement[]>({
    queryKey: ['announcements', teamId],
    queryFn: () => messageApi.getAnnouncements(teamId),
    enabled: !!teamId,
    staleTime: 60_000,
  })

  // ── Group chat query ──────────────────────────────────────────────────────
  const { data: chatData, isLoading: chatLoading } = useQuery<{ messages: Message[] }>({
    queryKey: ['team-messages', teamId],
    queryFn: () => messageApi.getTeamMessages(teamId),
    enabled: !!teamId && activeTab === 'chat',
    staleTime: 30_000,
  })

  useEffect(() => {
    if (chatData?.messages) {
      setMessages(chatData.messages)
    }
  }, [chatData])

  // ── Send message mutation ─────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: (body: string) => messageApi.sendTeamMessage(teamId, body),
    onSuccess: (newMsg: Message) => {
      setMessages((prev) => [...prev, newMsg])
    },
  })

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed || sendMutation.isPending) return
    setInputValue('')
    sendMutation.mutate(trimmed)
  }, [inputValue, sendMutation])

  // ── Delete message mutation ───────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (messageId: string) => messageApi.deleteMessage(messageId),
    onSuccess: (_data, messageId) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId))
    },
  })

  // ── Sorted announcements: pinned first ────────────────────────────────────
  const sortedAnnouncements = [...announcements].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1
    if (!a.isPinned && b.isPinned) return 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white">
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-0 border-b border-gray-800">
        <h1 className="text-xl font-bold text-white mb-3">Messages</h1>

        {/* Tabs */}
        <div className="flex gap-1" role="tablist" aria-label="Message sections">
          {([
            { id: 'announcements' as Tab, label: 'Announcements' },
            { id: 'chat' as Tab, label: 'Group Chat' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-xl border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-400 border-blue-500'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Announcements tab ── */}
      {activeTab === 'announcements' && (
        <div className="flex-1 overflow-y-auto">
          {/* Coach: new announcement button */}
          {isCoach && (
            <div className="px-4 pt-4 pb-2">
              <button
                type="button"
                aria-label="New Announcement"
                onClick={() => setNewAnnOpen(true)}
                className="w-full h-12 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 active:scale-[.98] transition-all flex items-center justify-center gap-2"
              >
                <span aria-hidden="true">+</span>
                New Announcement
              </button>
            </div>
          )}

          {annLoading && (
            <div className="px-4 pt-4 space-y-3" aria-label="Loading announcements">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-gray-800 animate-pulse" />
              ))}
            </div>
          )}

          {!annLoading && sortedAnnouncements.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center px-4">
              <span className="text-4xl" aria-hidden="true">📢</span>
              <p className="text-gray-400 text-sm">No announcements yet</p>
              {isCoach && (
                <p className="text-gray-500 text-xs">Post the first one above!</p>
              )}
            </div>
          )}

          {!annLoading && (
            <div className="px-4 py-3 space-y-3 pb-24">
              {sortedAnnouncements.map((ann) => (
                <AnnouncementCard
                  key={ann.id}
                  {...ann}
                  isCoach={isCoach}
                  onPinToggle={async (id, currentPinned) => {
                    try {
                      await apiClient.patch(
                        `/messages/teams/${teamId}/announcements/${id}/pin`,
                        { isPinned: !currentPinned },
                      )
                      void qc.invalidateQueries({ queryKey: ['announcements', teamId] })
                    } catch (err) {
                      console.error(err)
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Group Chat tab ── */}
      {activeTab === 'chat' && (
        <>
          {/* Message list */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {chatLoading && (
              <div className="space-y-3" aria-label="Loading messages">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}
                  >
                    <div className={`h-12 rounded-2xl bg-gray-800 animate-pulse ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'}`} />
                  </div>
                ))}
              </div>
            )}

            {!chatLoading && messages.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <span className="text-4xl" aria-hidden="true">💬</span>
                <p className="text-gray-400 text-sm">No messages yet</p>
                <p className="text-gray-500 text-xs">Be the first to say something!</p>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                messageId={msg.id}
                body={msg.body}
                senderName={msg.senderName}
                senderInitials={msg.senderInitials}
                sentAt={msg.sentAt}
                isOwn={msg.senderId === myUserId}
                canDelete={msg.senderId === myUserId || isCoach}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Message input bar — stays above keyboard via padding */}
          <div
            className="flex-shrink-0 border-t border-gray-800 bg-gray-950 px-4 py-3"
            style={{ paddingBottom: 'max(0.75rem, env(keyboard-inset-height, 0px) + 0.75rem)' }}
          >
            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…"
                aria-label="Message input"
                className="flex-1 min-h-[44px] max-h-32 bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                style={{ fieldSizing: 'content' } as React.CSSProperties}
              />
              <button
                type="button"
                aria-label="Send message"
                disabled={!inputValue.trim() || sendMutation.isPending}
                onClick={handleSend}
                className="w-11 h-11 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all flex-shrink-0"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" aria-hidden="true">
                  <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}

      {/* New Announcement Sheet */}
      <NewAnnouncementSheet
        isOpen={newAnnOpen}
        teamId={teamId}
        onClose={() => setNewAnnOpen(false)}
        onSaved={() => {
          setNewAnnOpen(false)
          void qc.invalidateQueries({ queryKey: ['announcements', teamId] })
        }}
      />
    </div>
  )
}
