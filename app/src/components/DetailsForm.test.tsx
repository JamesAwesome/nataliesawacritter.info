import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useFakeClock } from '../test/helpers'
import { DetailsForm } from './DetailsForm'

describe('DetailsForm', () => {
  useFakeClock()

  it('disables Save when the date is cleared', () => {
    render(<DetailsForm emoji="🦊" initialName="Fox" onBack={() => {}} onSave={vi.fn()} saving={false} />)
    const save = screen.getByRole('button', { name: /save sighting/i })
    expect(save).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } })
    expect(save).toBeDisabled()
  })

  it('disables Save while saving', () => {
    render(<DetailsForm emoji="🦊" initialName="Fox" onBack={() => {}} onSave={vi.fn()} saving={true} />)
    expect(screen.getByRole('button', { name: /save sighting/i })).toBeDisabled()
  })

  it('Now fills the time input and the payload carries the sortable 24h time', async () => {
    const onSave = vi.fn()
    render(<DetailsForm emoji="🦊" initialName="Fox" onBack={() => {}} onSave={onSave} saving={false} />)
    await userEvent.click(screen.getByRole('button', { name: /now/i }))
    expect(screen.getByLabelText('Time')).toHaveValue('15:00')
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    // Stored raw (sortable); formatted to "3:00 PM" only at display time.
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ sightedTime: '15:00' }))
  })

  it('defaults the time to the current clock time when left blank', async () => {
    const onSave = vi.fn()
    render(<DetailsForm emoji="🦊" initialName="Fox" onBack={() => {}} onSave={onSave} saving={false} />)
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    // Blank time → "now" (FIXED_NOW 15:00): the sighting is timed, not untimed "just now".
    expect(onSave).toHaveBeenCalledWith({ emoji: '🦊', sightedOn: '2026-07-03', name: 'Fox', sightedTime: '15:00' })
  })

  it('disables Save for a future date and sets max on the date input', () => {
    const onSave = vi.fn()
    render(<DetailsForm emoji="🦊" initialName="Fox" onBack={() => {}} onSave={onSave} saving={false} />)
    expect(screen.getByLabelText('Date')).toHaveAttribute('max', '2026-07-03')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-01' } })
    expect(screen.getByRole('button', { name: /save sighting/i })).toBeDisabled()
  })

  it('warns that the place field is public', () => {
    render(<DetailsForm emoji="🦊" initialName="Fox" onBack={() => {}} onSave={() => {}} saving={false} />)
    const hint = screen.getByText(/don't reveal where you live/i)
    expect(hint).toHaveTextContent(/public/i)
  })

  it('defaults the How many? control to 1', () => {
    render(<DetailsForm emoji="🦊" initialName="Fox" onBack={() => {}} onSave={vi.fn()} saving={false} />)
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Many' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('sends the chosen quantity in the payload', async () => {
    const onSave = vi.fn()
    render(<DetailsForm emoji="🦊" initialName="Fox" onBack={() => {}} onSave={onSave} saving={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Many' }))
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ quantity: 'many' }))
  })

  it('omits quantity from the payload when left at the default of 1', async () => {
    const onSave = vi.fn()
    render(<DetailsForm emoji="🦊" initialName="Fox" onBack={() => {}} onSave={onSave} saving={false} />)
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(onSave).toHaveBeenCalledWith({ emoji: '🦊', sightedOn: '2026-07-03', name: 'Fox', sightedTime: '15:00' })
  })
})
