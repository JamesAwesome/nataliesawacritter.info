import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { useScrollLock } from '../hooks/useScrollLock'

type Props = { open: boolean; onClose: () => void; children: ReactNode }

const DISMISS_THRESHOLD = 100

/** Bottom sheet on mobile, centered modal ≥880px — docs/design/README.md §Sheet.
 *  On touch devices it can be dragged down by its handle to dismiss. */
export function Sheet({ open, onClose, children }: Props) {
  const pressStartedOnScrim = useRef(false)
  const scrimRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef(0)
  const isDragging = useRef(false)
  const [dragOffset, setDragOffset] = useState(0)
  const isDesktop = useIsDesktop()

  // Freeze the page behind the sheet so scrolling/dragging on the scrim doesn't
  // bleed through to the body underneath (notably on iOS).
  useScrollLock(open)

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

  // On mobile the on-screen keyboard shrinks the *visual* viewport but not the
  // layout viewport, so a `position: fixed; inset: 0` scrim keeps its full layout
  // height and iOS shifts fixed elements to reveal the (scroll-locked) page behind
  // it — the bottom sheet vanishes behind the keyboard. Size the scrim to the
  // visual viewport so the sheet always sits within the visible area, above the
  // keyboard, and its content scrolls internally. See docs/design/README.md §Sheet.
  useEffect(() => {
    const vv = window.visualViewport
    const scrim = scrimRef.current
    if (!open || vv == null || scrim == null) return
    // Largest viewport height seen while open = the keyboard-closed baseline. A
    // meaningful shrink from it means the keyboard is up (the Safari toolbar
    // toggling is <120px and is anyway baked into the baseline, so it won't
    // false-trigger). When up, a white backdrop fills behind the iOS input
    // accessory bar so the sheet reads as docked to the keyboard, not floating.
    let baseline = vv.height
    const apply = () => {
      baseline = Math.max(baseline, vv.height)
      scrim.style.height = `${vv.height}px`
      scrim.style.top = `${vv.offsetTop}px`
      scrim.dataset.keyboard = baseline - vv.height > 120 ? 'open' : ''
    }
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      scrim.style.height = ''
      scrim.style.top = ''
      delete scrim.dataset.keyboard
    }
  }, [open])

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
      ref={scrimRef}
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
