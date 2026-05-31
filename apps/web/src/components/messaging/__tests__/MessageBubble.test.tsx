import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MessageBubble } from '../MessageBubble.js'

// ── Sample props ──────────────────────────────────────────────────────────────

const baseProps = {
  messageId: 'msg-1',
  body: 'Hello, world!',
  senderName: 'Coach Smith',
  senderInitials: 'CS',
  sentAt: new Date().toISOString(),
  isOwn: false,
  canDelete: false,
  onDelete: vi.fn(),
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MessageBubble', () => {
  it('renders the message body', () => {
    render(<MessageBubble {...baseProps} />)
    expect(screen.getByText('Hello, world!')).toBeInTheDocument()
  })

  it('shows sender name for others\' messages', () => {
    render(<MessageBubble {...baseProps} isOwn={false} />)
    expect(screen.getByText(/Coach Smith/)).toBeInTheDocument()
  })

  it('own messages are right-aligned (flex-row-reverse)', () => {
    const { container } = render(<MessageBubble {...baseProps} isOwn={true} />)
    const wrapper = container.querySelector('[data-testid="message-bubble"]')
    expect(wrapper?.className).toContain('flex-row-reverse')
  })

  it("others' messages are left-aligned (flex-row)", () => {
    const { container } = render(<MessageBubble {...baseProps} isOwn={false} />)
    const wrapper = container.querySelector('[data-testid="message-bubble"]')
    expect(wrapper?.className).toContain('flex-row')
    expect(wrapper?.className).not.toContain('flex-row-reverse')
  })

  it('own messages have blue bubble background', () => {
    const { container } = render(<MessageBubble {...baseProps} isOwn={true} />)
    const bubble = container.querySelector('.bg-blue-600')
    expect(bubble).toBeInTheDocument()
  })

  it("others' messages have gray bubble background", () => {
    const { container } = render(<MessageBubble {...baseProps} isOwn={false} />)
    const bubble = container.querySelector('.bg-gray-800')
    expect(bubble).toBeInTheDocument()
  })

  it('does not show avatar for own messages', () => {
    const { container } = render(<MessageBubble {...baseProps} isOwn={true} />)
    // Avatar div has initials for others only
    const avatars = container.querySelectorAll('[aria-hidden="true"].rounded-full')
    expect(avatars.length).toBe(0)
  })

  it('shows avatar initials for others\' messages', () => {
    const { container } = render(<MessageBubble {...baseProps} isOwn={false} />)
    expect(screen.getByText('CS')).toBeInTheDocument()
  })

  it('does not show delete option when canDelete is false', () => {
    render(<MessageBubble {...baseProps} canDelete={false} />)
    expect(screen.queryByRole('button', { name: /message options/i })).not.toBeInTheDocument()
  })

  it('shows message options button when canDelete is true', () => {
    render(<MessageBubble {...baseProps} canDelete={true} />)
    expect(screen.getByRole('button', { name: /message options/i })).toBeInTheDocument()
  })

  it('shows delete option in menu when options button is clicked', () => {
    render(<MessageBubble {...baseProps} canDelete={true} />)
    fireEvent.click(screen.getByRole('button', { name: /message options/i }))
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('calls onDelete with messageId when delete is clicked', () => {
    const onDelete = vi.fn()
    render(<MessageBubble {...baseProps} canDelete={true} onDelete={onDelete} />)

    fireEvent.click(screen.getByRole('button', { name: /message options/i }))
    fireEvent.click(screen.getByText('Delete'))

    expect(onDelete).toHaveBeenCalledWith('msg-1')
  })

  it('coach can delete others\' messages (canDelete=true on others)', () => {
    // Simulate coach viewing someone else's message
    render(
      <MessageBubble
        {...baseProps}
        isOwn={false}
        canDelete={true}
        senderName="Player One"
        senderInitials="PO"
      />
    )
    expect(screen.getByRole('button', { name: /message options/i })).toBeInTheDocument()
  })
})
