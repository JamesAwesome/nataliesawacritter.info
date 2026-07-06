import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useIsDesktop } from '../hooks/useIsDesktop'

type Props = { open: boolean; onClose: () => void; children: ReactNode }

const DISMISS_THRESHOLD = 100

/** Bottom sheet on mobile, centered modal ≥880px — docs/design/README.md §Sheet.
 *  On touch devices it can be dragged down by its handle to dismiss. */
export function Sheet({ open, onClose, children }: Props) {
  const pressStartedOnScrim = useRef(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef(0)
  const isDragging = useRef(false)
  const [dragOffset, setDragOffset] = useState(0)
  const isDesktop = useIsDesktop()

  // Latest-ref so the touch effect calls the current onClose without
  // re-subscribing its native listeners whenever onClose identity changes.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Reset any residual displacement when the sheet closes. Adjusted during
  // render (rather than in an effect) per the React-documented pattern for
  // resetting state on a prop change: https://react.dev/learn/you-might-not-need-an-effect
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open && dragOffset !== 0) setDragOffset(0)
  }

  // Native touch listeners (touchmove is passive:false so it can preventDefault
  // and stop the page scrolling under the drag). Disabled on desktop.
  useEffect(() => {
    const sheet = sheetRef.current
    if (!open || isDesktop || sheet === null) return

    function onTouchStart(e: TouchEvent) {
      const drag = dragRef.current
      const target = e.target as Node
      if (drag !== null && (drag === target || drag.contains(target))) {
        dragStartY.current = e.touches[0].clientY
        isDragging.current = true
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (!isDragging.current) return
      e.preventDefault()
      setDragOffset(Math.max(0, e.touches[0].clientY - dragStartY.current))
    }
    function onTouchEnd() {
      if (!isDragging.current) return
      isDragging.current = false
      setDragOffset((current) => {
        if (current > DISMISS_THRESHOLD) onCloseRef.current()
        return 0
      })
    }

    sheet.addEventListener('touchstart', onTouchStart, { passive: true })
    sheet.addEventListener('touchmove', onTouchMove, { passive: false })
    sheet.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      sheet.removeEventListener('touchstart', onTouchStart)
      sheet.removeEventListener('touchmove', onTouchMove)
      sheet.removeEventListener('touchend', onTouchEnd)
    }
  }, [open, isDesktop])

  if (!open) return null

  const sheetStyle =
    dragOffset > 0 ? { transform: `translateY(${dragOffset}px)`, transition: 'none' } : undefined
  const scrimStyle =
    dragOffset > 0 ? { opacity: Math.max(0.15, 1 - dragOffset / 300) } : undefined

  return (
    <div
      className="sheet-scrim"
      data-testid="sheet-scrim"
      style={scrimStyle}
      onPointerDown={(e) => {
        pressStartedOnScrim.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (pressStartedOnScrim.current && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-drag" data-testid="sheet-drag" ref={dragRef}>
          <div className="sheet-handle" aria-hidden="true" />
        </div>
        {children}
      </div>
    </div>
  )
}
