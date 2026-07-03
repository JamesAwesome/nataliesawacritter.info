import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Sheet } from './Sheet'

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(<Sheet open={false} onClose={() => {}}>hi</Sheet>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders children in a dialog when open', () => {
    render(<Sheet open onClose={() => {}}><p>content</p></Sheet>)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('calls onClose on scrim click but not on content click', async () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose}><p>content</p></Sheet>)
    await userEvent.click(screen.getByText('content'))
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByTestId('sheet-scrim'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose}>x</Sheet>)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when a press starts inside the content and ends on the scrim', () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose}><p>content</p></Sheet>)
    fireEvent.pointerDown(screen.getByText('content'))
    fireEvent.click(screen.getByTestId('sheet-scrim'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
