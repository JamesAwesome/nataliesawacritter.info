import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
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
})
