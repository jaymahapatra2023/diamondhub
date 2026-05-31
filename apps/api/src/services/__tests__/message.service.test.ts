// E10 · Communication & Messaging — Service unit tests
// Mocks: prisma, getSocket

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { messageService } from '../message.service.js'
import { prisma } from '@diamondhub/db'

// ── Mock Socket.io ────────────────────────────────────────────────────────────

// vi.hoisted runs before vi.mock hoisting — safe to reference in factory
const { mockEmit, mockTo } = vi.hoisted(() => {
  const mockEmit = vi.fn()
  const mockTo = vi.fn().mockReturnValue({ emit: mockEmit })
  return { mockEmit, mockTo }
})

vi.mock('../../lib/socket.js', () => ({
  getSocket: vi.fn().mockReturnValue({ to: mockTo }),
  emitScoreUpdate: vi.fn(),
  setupSocket: vi.fn(),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEAM_ID = 'team-1'
const USER_ID = 'user-1'
const SENDER_ID = 'user-2'
const MESSAGE_ID = 'msg-1'
const ANN_ID = 'ann-1'
const NOW = new Date('2026-06-01T12:00:00.000Z')

const mockSender = { id: SENDER_ID, name: 'Alice', avatarUrl: null }

const mockDbMessage = {
  id: MESSAGE_ID,
  teamId: TEAM_ID,
  threadType: 'TEAM',
  senderId: SENDER_ID,
  recipientId: null,
  body: 'Hello team!',
  attachmentUrl: null,
  isDeleted: false,
  deletedAt: null,
  createdAt: NOW,
  sender: mockSender,
  readReceipts: [{ userId: SENDER_ID }],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('messageService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── getTeamMessages ───────────────────────────────────────────────────────

  describe('getTeamMessages', () => {
    it('returns messages in chronological order (oldest first)', async () => {
      const msg1 = { ...mockDbMessage, id: 'msg-1', createdAt: new Date('2026-06-01T10:00:00Z') }
      const msg2 = { ...mockDbMessage, id: 'msg-2', createdAt: new Date('2026-06-01T11:00:00Z') }
      // findMany returns desc order (newest first), service reverses to chronological
      vi.mocked(prisma.message.findMany).mockResolvedValue([msg2, msg1] as any)

      const result = await messageService.getTeamMessages(TEAM_ID)

      expect(Array.isArray(result)).toBe(true)
      expect(result[0]!.id).toBe('msg-1')
      expect(result[1]!.id).toBe('msg-2')
    })

    it('maps message fields correctly', async () => {
      vi.mocked(prisma.message.findMany).mockResolvedValue([mockDbMessage] as any)

      const result = await messageService.getTeamMessages(TEAM_ID)

      expect(result[0]).toMatchObject({
        id: MESSAGE_ID,
        teamId: TEAM_ID,
        threadType: 'TEAM',
        senderId: SENDER_ID,
        senderName: 'Alice',
        senderAvatar: null,
        body: 'Hello team!',
        readBy: [SENDER_ID],
      })
      expect(typeof result[0]!.createdAt).toBe('string')
    })
  })

  // ── sendMessage ───────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('creates message record and returns it', async () => {
      vi.mocked(prisma.message.create).mockResolvedValue(mockDbMessage as any)
      vi.mocked(prisma.messageReadReceipt.create).mockResolvedValue({} as any)

      const result = await messageService.sendMessage(TEAM_ID, SENDER_ID, 'Hello team!', 'TEAM')

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            teamId: TEAM_ID,
            senderId: SENDER_ID,
            body: 'Hello team!',
            threadType: 'TEAM',
          }),
        }),
      )
      expect(result).toBeDefined()
    })

    it('emits Socket.io event after DB write', async () => {
      vi.mocked(prisma.message.create).mockResolvedValue(mockDbMessage as any)
      vi.mocked(prisma.messageReadReceipt.create).mockResolvedValue({} as any)

      await messageService.sendMessage(TEAM_ID, SENDER_ID, 'Hello!', 'TEAM')

      expect(mockTo).toHaveBeenCalledWith(`team:${TEAM_ID}`)
      expect(mockEmit).toHaveBeenCalledWith('message:new', expect.objectContaining({
        teamId: TEAM_ID,
        threadType: 'TEAM',
        body: 'Hello!',
      }))
    })

    it('auto-marks message as read for the sender', async () => {
      vi.mocked(prisma.message.create).mockResolvedValue(mockDbMessage as any)
      vi.mocked(prisma.messageReadReceipt.create).mockResolvedValue({} as any)

      await messageService.sendMessage(TEAM_ID, SENDER_ID, 'Hello!', 'TEAM')

      expect(prisma.messageReadReceipt.create).toHaveBeenCalledWith({
        data: { messageId: MESSAGE_ID, userId: SENDER_ID },
      })
    })

    it('uses DM room for DIRECT thread type', async () => {
      const dmMsg = { ...mockDbMessage, threadType: 'DIRECT', recipientId: USER_ID }
      vi.mocked(prisma.message.create).mockResolvedValue(dmMsg as any)
      vi.mocked(prisma.messageReadReceipt.create).mockResolvedValue({} as any)

      await messageService.sendMessage(TEAM_ID, SENDER_ID, 'Hey!', 'DIRECT', USER_ID)

      expect(mockTo).toHaveBeenCalledWith(`dm:${SENDER_ID}:${USER_ID}`)
    })
  })

  // ── deleteMessage ─────────────────────────────────────────────────────────

  describe('deleteMessage', () => {
    it('coach can delete any message', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue({
        ...mockDbMessage,
        senderId: 'some-other-user',
      } as any)
      vi.mocked(prisma.message.update).mockResolvedValue({} as any)

      await expect(
        messageService.deleteMessage(MESSAGE_ID, USER_ID, true /* isCoach */),
      ).resolves.not.toThrow()

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: MESSAGE_ID },
        data: expect.objectContaining({ isDeleted: true }),
      })
    })

    it('sender can delete own message', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue({
        ...mockDbMessage,
        senderId: USER_ID,
      } as any)
      vi.mocked(prisma.message.update).mockResolvedValue({} as any)

      await expect(
        messageService.deleteMessage(MESSAGE_ID, USER_ID, false /* not coach */),
      ).resolves.not.toThrow()

      expect(prisma.message.update).toHaveBeenCalled()
    })

    it('throws FORBIDDEN for non-coach attempting to delete another user\'s message', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue({
        ...mockDbMessage,
        senderId: 'other-user',
      } as any)

      await expect(
        messageService.deleteMessage(MESSAGE_ID, USER_ID, false /* not coach */),
      ).rejects.toThrow('FORBIDDEN')

      expect(prisma.message.update).not.toHaveBeenCalled()
    })

    it('throws NOT_FOUND when message does not exist', async () => {
      vi.mocked(prisma.message.findUnique).mockResolvedValue(null)

      await expect(
        messageService.deleteMessage(MESSAGE_ID, USER_ID, true),
      ).rejects.toThrow('NOT_FOUND')
    })
  })

  // ── markRead ──────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('upserts read receipt for user and message', async () => {
      vi.mocked(prisma.messageReadReceipt.upsert).mockResolvedValue({} as any)

      await messageService.markRead(MESSAGE_ID, USER_ID)

      expect(prisma.messageReadReceipt.upsert).toHaveBeenCalledWith({
        where: { messageId_userId: { messageId: MESSAGE_ID, userId: USER_ID } },
        update: {},
        create: { messageId: MESSAGE_ID, userId: USER_ID },
      })
    })
  })

  // ── createAnnouncement ────────────────────────────────────────────────────

  describe('createAnnouncement', () => {
    it('creates announcement with isPinned=false by default', async () => {
      const mockAnn = {
        id: ANN_ID,
        teamId: TEAM_ID,
        authorId: USER_ID,
        title: 'Practice cancelled',
        body: 'Practice is cancelled this Friday.',
        isPinned: false,
        createdAt: NOW,
      }
      vi.mocked(prisma.announcement.create).mockResolvedValue(mockAnn as any)

      const result = await messageService.createAnnouncement(
        TEAM_ID,
        USER_ID,
        'Practice cancelled',
        'Practice is cancelled this Friday.',
      )

      expect(prisma.announcement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          teamId: TEAM_ID,
          authorId: USER_ID,
          title: 'Practice cancelled',
          isPinned: false,
        }),
      })
      expect(result.isPinned).toBe(false)
    })
  })

  // ── getAnnouncements ──────────────────────────────────────────────────────

  describe('getAnnouncements', () => {
    it('orders pinned announcements first then by date', async () => {
      const pinned = { id: 'ann-pinned', isPinned: true, createdAt: new Date('2026-05-01') }
      const unpinned = { id: 'ann-unpinned', isPinned: false, createdAt: new Date('2026-06-01') }
      vi.mocked(prisma.announcement.findMany).mockResolvedValue([pinned, unpinned] as any)

      await messageService.getAnnouncements(TEAM_ID)

      expect(prisma.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        }),
      )
    })
  })
})
