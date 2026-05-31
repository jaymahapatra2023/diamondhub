import { prisma } from '@diamondhub/db'
import { logger } from '../lib/logger.js'
import { getSocket } from '../lib/socket.js'

export const messageService = {

  // E10-S2: Get team group chat messages
  async getTeamMessages(teamId: string, page = 1, limit = 50) {
    const offset = (page - 1) * limit
    const messages = await prisma.message.findMany({
      where: { teamId, threadType: 'TEAM', isDeleted: false },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
        readReceipts: { select: { userId: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    })
    return messages.map(m => ({
      id: m.id,
      teamId: m.teamId,
      threadType: m.threadType,
      senderId: m.senderId,
      senderName: m.sender.name,
      senderAvatar: m.sender.avatarUrl,
      body: m.body,
      attachmentUrl: m.attachmentUrl,
      readBy: m.readReceipts.map(r => r.userId),
      createdAt: m.createdAt.toISOString(),
    })).reverse() // Chronological order
  },

  // E10-S3: Get DM thread between two users
  async getDmMessages(teamId: string, userId1: string, userId2: string, page = 1, limit = 50) {
    const offset = (page - 1) * limit
    return prisma.message.findMany({
      where: {
        teamId,
        threadType: 'DIRECT',
        isDeleted: false,
        OR: [
          { senderId: userId1, recipientId: userId2 },
          { senderId: userId2, recipientId: userId1 },
        ],
      },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
        readReceipts: { select: { userId: true } },
      },
      orderBy: { createdAt: 'asc' },
      skip: offset,
      take: limit,
    })
  },

  // Send a message
  async sendMessage(teamId: string, senderId: string, body: string, threadType: 'TEAM' | 'DIRECT', recipientId?: string, attachmentUrl?: string) {
    const message = await prisma.message.create({
      data: {
        teamId,
        threadType,
        senderId,
        recipientId: recipientId ?? null,
        body,
        attachmentUrl: attachmentUrl ?? null,
      },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
    })

    // Auto-mark as read for sender
    await prisma.messageReadReceipt.create({
      data: { messageId: message.id, userId: senderId },
    }).catch(() => {}) // ignore if already exists

    // Emit via Socket.io (P3: progressive enhancement)
    const io = getSocket()
    if (io) {
      const room = threadType === 'TEAM' ? `team:${teamId}` : `dm:${senderId}:${recipientId ?? ''}`
      io.to(room).emit('message:new', {
        id: message.id,
        teamId,
        threadType,
        senderId,
        senderName: message.sender.name,
        senderAvatar: message.sender.avatarUrl,
        body,
        attachmentUrl: attachmentUrl ?? null,
        createdAt: message.createdAt.toISOString(),
      })
    }

    logger.info({ messageId: message.id, teamId, threadType }, 'Message sent')
    return message
  },

  // Delete message (coach can delete any; sender can delete own)
  async deleteMessage(messageId: string, userId: string, isCoach: boolean) {
    const msg = await prisma.message.findUnique({ where: { id: messageId } })
    if (!msg) throw new Error('NOT_FOUND')
    if (!isCoach && msg.senderId !== userId) throw new Error('FORBIDDEN')

    await prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, deletedAt: new Date() },
    })
  },

  // Mark message as read
  async markRead(messageId: string, userId: string) {
    await prisma.messageReadReceipt.upsert({
      where: { messageId_userId: { messageId, userId } },
      update: {},
      create: { messageId, userId },
    })
  },

  // E10-S4: Get unified inbox (all threads for coach)
  async getInbox(userId: string) {
    // Get last message from each thread the user is part of
    const teams = await prisma.teamMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { teamId: true, team: { select: { name: true } } },
    })

    const threads = []
    for (const { teamId, team } of teams) {
      const lastMsg = await prisma.message.findFirst({
        where: { teamId, threadType: 'TEAM', isDeleted: false },
        orderBy: { createdAt: 'desc' },
        include: { sender: { select: { name: true } } },
      })
      if (!lastMsg) continue

      const unread = await prisma.message.count({
        where: {
          teamId,
          threadType: 'TEAM',
          isDeleted: false,
          NOT: { readReceipts: { some: { userId } } },
        },
      })

      threads.push({
        teamId,
        teamName: team.name,
        threadType: 'TEAM',
        lastMessage: lastMsg.body,
        lastSender: lastMsg.sender.name,
        lastAt: lastMsg.createdAt.toISOString(),
        unreadCount: unread,
      })
    }

    return threads.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
  },

  // E10-S1: Team announcements
  async createAnnouncement(teamId: string, authorId: string, title: string, body: string) {
    const ann = await prisma.announcement.create({
      data: { teamId, authorId, title, body, isPinned: false },
    })
    logger.info({ annId: ann.id, teamId }, 'Announcement created')
    return ann
  },

  async getAnnouncements(teamId: string) {
    return prisma.announcement.findMany({
      where: { teamId },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    })
  },

  async pinAnnouncement(announcementId: string, teamId: string, pin: boolean) {
    return prisma.announcement.update({
      where: { id: announcementId, teamId },
      data: { isPinned: pin },
    })
  },
}
