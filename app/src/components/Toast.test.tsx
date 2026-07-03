import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Toast } from './Toast'

describe('Toast', () => {
  it('renders nothing when message is null', () => {
    render(<Toast message={null} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders the message when set', () => {
    render(<Toast message="🎉 Logged!" />)
    expect(screen.getByRole('status')).toHaveTextContent('🎉 Logged!')
  })
})
