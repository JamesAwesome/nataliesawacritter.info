import { useEffect } from 'react'

// Freezes the page behind an overlay. iOS Safari ignores `overflow: hidden` on
// the body, so we pin the body with `position: fixed` at its current scroll
// offset (and restore the offset on release). Ref-counted so overlapping locks
// (e.g. one sheet opening as another closes) don't unpin early.
let lockCount = 0
let scrollY = 0
let saved: Partial<CSSStyleDeclaration> | null = null

function lock(): void {
  if (lockCount === 0) {
    scrollY = window.scrollY
    const s = document.body.style
    saved = { position: s.position, top: s.top, left: s.left, right: s.right, width: s.width, overflow: s.overflow }
    s.position = 'fixed'
    s.top = `-${scrollY}px`
    s.left = '0'
    s.right = '0'
    s.width = '100%'
    s.overflow = 'hidden'
  }
  lockCount += 1
}

function unlock(): void {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0 && saved !== null) {
    const s = document.body.style
    s.position = saved.position ?? ''
    s.top = saved.top ?? ''
    s.left = saved.left ?? ''
    s.right = saved.right ?? ''
    s.width = saved.width ?? ''
    s.overflow = saved.overflow ?? ''
    saved = null
    window.scrollTo(0, scrollY)
  }
}

/** Locks page scroll while `active` is true; restores it (and the scroll
 *  position) when it flips false or the component unmounts. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    lock()
    return unlock
  }, [active])
}
