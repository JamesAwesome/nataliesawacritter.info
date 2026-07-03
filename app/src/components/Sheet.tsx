import { useEffect, type ReactNode } from 'react'

type Props = { open: boolean; onClose: () => void; children: ReactNode }

/** Bottom sheet on mobile, centered modal ≥880px — docs/design/README.md §Sheet. */
export function Sheet({ open, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="sheet-scrim" data-testid="sheet-scrim" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        {children}
      </div>
    </div>
  )
}
