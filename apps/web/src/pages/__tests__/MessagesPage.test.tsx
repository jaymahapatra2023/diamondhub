import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MessagesPage } from '../MessagesPage.js'
import { messageApi } from '../../api/message.api.js'

// ── Auth store mock ────────────────────────────────────────────────────────────

const authState = {
  user: { id: 'user-1', roles: [{ role: 'PARENT', isPrimary: true, teamId: 'team-1' }] } as any,
  activeRole: { role: 'PARENT', teamId: 'team-1' } as { role: string; teamId: string | null } | null,
}

vi.mock('../../store/auth.store.js', () => ({
  useAuthStore: (selector?: (s: typeof authState) => unknown) =>
    selector ? selector(authState) : authState,
}))

// ── Message API mock ───────────────────────────────────────────────────────────

vi.mock('../../api/message.api.js', () => ({
  messageApi: {
    getAnnouncements: vi.fn(),
    getTeamMessages: vi.fn(),
    createAnnouncement: vi.fn(),
    sendTeamMessage: vi.fn(),
    deleteMessage: vi.fn(),
    markRead: vi.fn(),
    getDmMessages: vi.fn(),
    sendDm: vi.fn(),
    getInbox: vi.fn(),
  },
}))

// ── Sample data ───────────────────────────────────────────────────────────────

const SAMPLE_ANNOUNCEMENTS = [
  {
    id: 'ann-1',
    title: 'Practice cancelled',
    body: 'Tuesday practice is cancelled due to rain.',
    authorName: 'Coach Smith',
    createdAt: '2026-05-01T10:00:00.000Z',
    isPinned: true,
  },
  {
    id: 'ann-2',
    title: 'Uniform pickup',
    body: 'Pick up your uniforms from the dugout.',
    authorName: 'Coach Smith',
    createdAt: '2026-05-02T08:00:00.000Z',
    isPinned: false,
  },
]

const SAMPLE_MESSAGES = {
  messages: [
    {
      id: 'msg-1',
      body: 'Hey team!',
      senderId: 'user-2',
      senderName: 'Coach Smith',
      senderInitials: 'CS',
      sentAt: '2026-05-01T12:00:00.000Z',
    },
    {
      id: 'msg-2',
      body: 'Ready for the game!',
      senderId: 'user-1',
      senderName: 'Jay',
      senderInitials: 'J',
      sentAt: '2026-05-01T12:05:00.000Z',
    },
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderPage(queryClient = makeQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MessagesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MessagesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.activeRole = { role: 'PARENT', teamId: 'team-1' }
    authState.user = {
      id: 'user-1',
      roles: [{ role: 'PARENT', isPrimary: true, teamId: 'team-1' }],
    } as any

    vi.mocked(messageApi.getAnnouncements).mockResolvedValue([])
    vi.mocked(messageApi.getTeamMessages).mockResolvedValue({ messages: [] })
    vi.mocked(messageApi.sendTeamMessage).mockResolvedValue({
      id: 'new-msg',
      body: 'Test message',
      senderId: 'user-1',
      senderName: 'Jay',
      senderInitials: 'J',
      sentAt: new Date().toISOString(),
    })
    vi.mocked(messageApi.createAnnouncement).mockResolvedValue({})
    vi.mocked(messageApi.markRead).mockResolvedValue({})
  })

  it('renders Announcements tab', () => {
    renderPage()
    const annTab = screen.getByRole('tab', { name: /announcements/i })
    expect(annTab).toBeInTheDocument()
  })

  it('renders Group Chat tab', () => {
    renderPage()
    const chatTab = screen.getByRole('tab', { name: /group chat/i })
    expect(chatTab).toBeInTheDocument()
  })

  it('shows Announcements tab selected by default', () => {
    renderPage()
    const annTab = screen.getByRole('tab', { name: /announcements/i })
    expect(annTab.getAttribute('aria-selected')).toBe('true')
  })

  it('shows announcements in list after loading', async () => {
    vi.mocked(messageApi.getAnnouncements).mockResolvedValue(SAMPLE_ANNOUNCEMENTS)
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Practice cancelled')).toBeInTheDocument()
    })
    expect(screen.getByText('Uniform pickup')).toBeInTheDocument()
  })

  it('switches to Group Chat tab when clicked', async () => {
    renderPage()
    const chatTab = screen.getByRole('tab', { name: /group chat/i })
    fireEvent.click(chatTab)

    await waitFor(() => {
      expect(chatTab.getAttribute('aria-selected')).toBe('true')
    })
  })

  it('shows message input in Group Chat tab', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: /group chat/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/message input/i)).toBeInTheDocument()
    })
  })

  it('send button is present in Group Chat tab', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: /group chat/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument()
    })
  })

  it('sends message on button click', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: /group chat/i }))

    await waitFor(() => screen.getByLabelText(/message input/i))

    const input = screen.getByLabelText(/message input/i)
    fireEvent.change(input, { target: { value: 'Hello team!' } })

    const sendBtn = screen.getByRole('button', { name: /send message/i })
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(vi.mocked(messageApi.sendTeamMessage)).toHaveBeenCalledWith('team-1', 'Hello team!')
    })
  })

  it('shows sent message in chat after sending', async () => {
    vi.mocked(messageApi.getTeamMessages).mockResolvedValue(SAMPLE_MESSAGES)
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: /group chat/i }))

    await waitFor(() => {
      expect(screen.getByText('Hey team!')).toBeInTheDocument()
    })
  })

  it('coach sees "New Announcement" button in Announcements tab', async () => {
    authState.activeRole = { role: 'COACH', teamId: 'team-1' }
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new announcement/i })).toBeInTheDocument()
    })
  })

  it('non-coach does NOT see "New Announcement" button', async () => {
    authState.activeRole = { role: 'PARENT', teamId: 'team-1' }
    renderPage()

    await waitFor(() => {
      // Wait for announcements to finish loading
      expect(vi.mocked(messageApi.getAnnouncements)).toHaveBeenCalled()
    })

    expect(screen.queryByRole('button', { name: /new announcement/i })).not.toBeInTheDocument()
  })
})
