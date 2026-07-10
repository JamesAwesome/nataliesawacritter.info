import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Sheet } from './Sheet'
import { stubMatchMedia } from '../test/helpers'

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(<Sheet open={false} onClose={() => {}}>hi</Sheet>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('locks the page (body) scroll while open and restores it when closed', () => {
    vi.stubGlobal('scrollTo', vi.fn()) // jsdom doesn't implement window.scrollTo
    const { rerender } = render(<Sheet open={false} onClose={() => {}}>hi</Sheet>)
    expect(document.body.style.position).toBe('')

    rerender(<Sheet open onClose={() => {}}>hi</Sheet>)
    // position:fixed (not just overflow:hidden) — iOS Safari ignores overflow.
    expect(document.body.style.position).toBe('fixed')
    expect(document.body.style.overflow).toBe('hidden')

    rerender(<Sheet open={false} onClose={() => {}}>hi</Sheet>)
    expect(document.body.style.position).toBe('')
    expect(document.body.style.overflow).toBe('')
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

  function touch(clientY: number) {
    return { touches: [{ clientY }] } as unknown as TouchEventInit
  }

  it('dismisses when the handle is dragged down past the threshold', () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose}><p>content</p></Sheet>)
    const strip = screen.getByTestId('sheet-drag')
    fireEvent.touchStart(strip, touch(0))
    fireEvent.touchMove(strip, touch(150))
    fireEvent.touchEnd(strip, touch(150))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('springs back (no close) on a short drag', () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose}><p>content</p></Sheet>)
    const strip = screen.getByTestId('sheet-drag')
    fireEvent.touchStart(strip, touch(0))
    fireEvent.touchMove(strip, touch(40))
    fireEvent.touchEnd(strip, touch(40))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not drag when the touch starts in the content', () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose}><p>content</p></Sheet>)
    fireEvent.touchStart(screen.getByText('content'), touch(0))
    fireEvent.touchMove(screen.getByText('content'), touch(200))
    fireEvent.touchEnd(screen.getByText('content'), touch(200))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('attaches no drag-to-dismiss on desktop', () => {
    stubMatchMedia(true) // useIsDesktop → true
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose}><p>content</p></Sheet>)
    const strip = screen.getByTestId('sheet-drag')
    fireEvent.touchStart(strip, touch(0))
    fireEvent.touchMove(strip, touch(150))
    fireEvent.touchEnd(strip, touch(150))
    expect(onClose).not.toHaveBeenCalled()
  })
})
