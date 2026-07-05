import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PhotoControl } from './PhotoControl'

const downscalePhoto = vi.hoisted(() => vi.fn())
vi.mock('../lib/photo', () => ({ downscalePhoto }))

const FILE = new File(['raw'], 'pic.heic', { type: 'image/heic' })
const SMALL = new Blob(['small'], { type: 'image/jpeg' })

describe('PhotoControl', () => {
  it('picks → downscales → reports the blob and shows the added state', async () => {
    downscalePhoto.mockResolvedValueOnce(SMALL)
    const onPhoto = vi.fn()
    render(<PhotoControl photo={null} onPhoto={onPhoto} />)
    await userEvent.upload(screen.getByLabelText(/add a photo/i), FILE)
    await waitFor(() => expect(onPhoto).toHaveBeenCalledWith(SMALL))
  })

  it('shows the added state with a clear button when a photo is held', async () => {
    const onPhoto = vi.fn()
    render(<PhotoControl photo={SMALL} onPhoto={onPhoto} />)
    expect(screen.getByText('✓ Photo added')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(onPhoto).toHaveBeenCalledWith(null)
  })

  it('shows a friendly error when the browser cannot decode the pick', async () => {
    downscalePhoto.mockRejectedValueOnce(new Error('undecodable'))
    render(<PhotoControl photo={null} onPhoto={vi.fn()} />)
    await userEvent.upload(screen.getByLabelText(/add a photo/i), FILE)
    expect(await screen.findByText("Couldn't read that photo")).toBeInTheDocument()
  })
})

describe('keyboard access', () => {
  it('the file input is visually hidden, not display:none', () => {
    render(<PhotoControl photo={null} onPhoto={vi.fn()} />)
    const input = screen.getByLabelText(/add a photo/i)
    expect(input).toHaveClass('visually-hidden-input')
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf8')
    const block = css.split('.visually-hidden-input')[1]?.split('}')[0] ?? ''
    expect(block).toContain('clip-path')
    expect(block).not.toContain('display: none')
  })
})
