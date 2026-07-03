import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PasswordPrompt } from './PasswordPrompt'

describe('PasswordPrompt', () => {
  it('renders nothing when closed', () => {
    render(<PasswordPrompt open={false} error={null} onSubmit={() => {}} onCancel={() => {}} />)
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
  })

  it('submits the typed password', async () => {
    const onSubmit = vi.fn()
    render(<PasswordPrompt open error={null} onSubmit={onSubmit} onCancel={() => {}} />)
    await userEvent.type(screen.getByLabelText(/password/i), 'sekrit')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSubmit).toHaveBeenCalledWith('sekrit')
  })

  it('shows the error note when provided', () => {
    render(<PasswordPrompt open error="Wrong password — try again" onSubmit={() => {}} onCancel={() => {}} />)
    expect(screen.getByText('Wrong password — try again')).toBeInTheDocument()
  })

  it('cancel calls onCancel', async () => {
    const onCancel = vi.fn()
    render(<PasswordPrompt open error={null} onSubmit={() => {}} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
