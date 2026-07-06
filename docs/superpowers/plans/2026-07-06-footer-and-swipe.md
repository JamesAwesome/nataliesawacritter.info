# Footer + README + Swipe-to-Dismiss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three independent polish items in one pass — an attribution footer, a refreshed README, and swipe-to-dismiss on the modal sheets. Per `docs/superpowers/specs/2026-07-06-footer-and-readme-design.md` and `docs/superpowers/specs/2026-07-06-swipe-to-dismiss-design.md`.

**Architecture:** Task 1 adds a `Footer.tsx` (mirrors `Header.tsx`) mounted in `App.tsx` with a CSS rule. Task 2 is a text-only README refresh. Task 3 adds touch drag-to-dismiss to the shared `Sheet.tsx` + CSS (adapted from pool_monitor's `BottomSheet`), covering every modal at once. The three tasks touch disjoint code (Footer/App, README, Sheet) except both Tasks 1 and 3 append to `app/src/index.css` in different rules — no conflict.

**Tech Stack:** React 19, Vitest 4 + Testing Library. **No new dependencies.**

**Specs:** `docs/superpowers/specs/2026-07-06-footer-and-readme-design.md`, `docs/superpowers/specs/2026-07-06-swipe-to-dismiss-design.md`

## Global Constraints

- pnpm from `app/`; raw vitest needs `NODE_OPTIONS=--no-experimental-webstorage` prefix; no raw hex colors in TSX (use existing CSS vars/tokens); no new dependencies.
- Footer exact text: `©`, space, `{year}` (`new Date().getFullYear()`), ` · `, then the linked name `James Awesome`; link → `https://github.com/JamesAwesome`, `target="_blank"`, `rel="noopener noreferrer"`. Tests must NOT assert the literal year.
- Swipe: dismiss threshold `100`px; drag only from the handle strip; `touchmove` listener is `passive:false`; feature gated off when `useIsDesktop()` is true; dismiss calls the caller's `onClose` unchanged.
- FROZEN: all existing tests stay green; `Sheet.test.tsx`'s current scrim/Escape/press-in-content tests are byte-unchanged (append only).

---

### Task 1: Attribution footer

**Files:**
- Create: `app/src/components/Footer.tsx`, `app/src/components/Footer.test.tsx`
- Modify: `app/src/App.tsx` (mount `<Footer />`), `app/src/index.css` (append `.app-footer` rules)
- Test: `app/src/components/Footer.test.tsx`, one line in `app/src/App.test.tsx`

**Interfaces:**
- Produces: `Footer` (no props), default-exported? No — named export `export function Footer()`, matching `Header`.

- [ ] **Step 1: Write the failing Footer test**

Create `app/src/components/Footer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Footer } from './Footer'

describe('Footer', () => {
  it('links the author name to their GitHub in a new tab', () => {
    render(<Footer />)
    const link = screen.getByRole('link', { name: 'James Awesome' })
    expect(link).toHaveAttribute('href', 'https://github.com/JamesAwesome')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('shows a copyright line with the author', () => {
    render(<Footer />)
    // Match the © glyph + name, not the literal year (survives the calendar rollover).
    expect(screen.getByText(/©/)).toBeInTheDocument()
    expect(screen.getByText(/James Awesome/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `app/`): `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/components/Footer.test.tsx`
Expected: FAIL — `./Footer` module not found.

- [ ] **Step 3: Implement Footer**

Create `app/src/components/Footer.tsx`:

```tsx
export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="app-footer">
      © {year} ·{' '}
      <a href="https://github.com/JamesAwesome" target="_blank" rel="noopener noreferrer">
        James Awesome
      </a>
    </footer>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/components/Footer.test.tsx`
Expected: both PASS.

- [ ] **Step 5: Mount in App and add an App test line**

In `app/src/App.tsx`, add the import beside the other component imports:

```tsx
import { Footer } from './components/Footer'
```

Render it inside `.page`, immediately after the `</div>` that closes `.shell` and before the `<LogSightingFlow …>` element — i.e. the sibling right after the shell card. The relevant JSX becomes:

```tsx
        </div>
      </div>
      <Footer />
      <LogSightingFlow
```

(The first `</div>` closes `.columns`, the second closes `.shell`; `<Footer />` is a child of `.page`.)

In `app/src/App.test.tsx`, append one test to the existing `describe('App shell', …)` block. App fetches on mount, so stub fetch first exactly as the neighbouring tests do (`stubFetchQueue` and `stubMatchMedia` are already imported at the top of the file):

```tsx
  it('renders the attribution footer', () => {
    stubFetchQueue([{ status: 200, body: [] }])
    render(<App />)
    expect(screen.getByRole('link', { name: 'James Awesome' })).toHaveAttribute(
      'href',
      'https://github.com/JamesAwesome',
    )
  })
```

Do not change any existing test.

- [ ] **Step 6: Add the CSS**

Append to `app/src/index.css`:

```css
.app-footer {
  margin-top: 14px;
  text-align: center;
  font-size: 12px;
  color: var(--ink-secondary);
}

.app-footer a {
  color: var(--other-text);
  text-decoration: none;
}

.app-footer a:hover {
  text-decoration: underline;
}
```

- [ ] **Step 7: Verify and commit**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/components/Footer.test.tsx src/App.test.tsx && pnpm lint && pnpm typecheck`
Expected: green.

```bash
git add src/components/Footer.tsx src/components/Footer.test.tsx src/App.tsx src/App.test.tsx src/index.css
git commit -m "feat: attribution footer linking the author's GitHub"
```

---

### Task 2: README refresh

**Files:**
- Modify: `README.md` (repo root)

**Interfaces:** none (docs only).

- [ ] **Step 1: Broaden the intro paragraph**

In `README.md`, replace the opening paragraph (currently begins "Natalie sees things…" and ends "…leaderboard. Live (eventually) at nataliesawacritter.info.") with:

```markdown
Natalie sees things, she sees them with her eyes. This app lets her log
wildlife sightings — with photos and saved "critter friends" — and view them as
a calendar, a filterable history, and a Top Critters leaderboard. Friends can
subscribe to push notifications (it installs as a PWA on phones) to hear about
new sightings as they happen. Live at nataliesawacritter.info.
```

- [ ] **Step 2: Add the auth-check endpoint to the API list**

In the `## API` code block, add this line immediately after the `DELETE /api/profiles/:id` line and before the `GET /api/push/vapid-public-key` line:

```
    GET    /api/auth/check                                # basic auth; 204/401, 503 when writes disabled
```

- [ ] **Step 3: Add the Author & license section**

Append to the very end of `README.md`:

```markdown
## Author & license

Made by [James Awesome](https://github.com/JamesAwesome). Licensed under
GPL-3.0 — see [LICENSE](LICENSE).
```

- [ ] **Step 4: Verify and commit**

Read the rendered file top-to-bottom once to confirm the three edits are coherent and nothing else changed:

Run: `git -C .. diff --stat README.md` (expect only `README.md` changed) — or from repo root `git diff README.md`.

```bash
git add README.md
git commit -m "docs: refresh README intro, add auth-check endpoint and author/license"
```

---

### Task 3: Swipe-to-dismiss on the shared Sheet

**Files:**
- Modify: `app/src/components/Sheet.tsx`, `app/src/index.css`
- Test: `app/src/components/Sheet.test.tsx` (append)

**Interfaces:**
- Consumes: `useIsDesktop` from `../hooks/useIsDesktop`; existing `Sheet` props `{ open, onClose, children }`.
- Produces: no API change — `Sheet`'s props and behavior are unchanged for callers; adds internal drag-to-dismiss.

- [ ] **Step 1: Write the failing drag tests**

Append to `app/src/components/Sheet.test.tsx` (add `stubMatchMedia` to the imports from `../test/helpers`):

```tsx
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
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/components/Sheet.test.tsx`
Expected: FAIL — no `sheet-drag` testid; drag does nothing.

- [ ] **Step 3: Implement drag-to-dismiss in Sheet.tsx**

Replace the contents of `app/src/components/Sheet.tsx` with:

```tsx
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

  // Reset any residual displacement when the sheet closes.
  useEffect(() => {
    if (!open) setDragOffset(0)
  }, [open])

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
```

- [ ] **Step 4: Add the CSS**

In `app/src/index.css`: add a `.sheet-drag` rule and a `transform` transition on `.sheet`, and hide the handle + a reduced-motion rule.

Change the existing `.sheet` rule to include the transition (add the one line):

```css
.sheet {
  background: #fff;
  width: 100%;
  border-radius: 26px 26px 0 0;
  padding: 10px 18px 22px;
  max-height: 85vh;
  overflow-y: auto;
  animation: sheet-up 0.25s ease-out;
  transition: transform 0.22s ease-out;
}
```

Add the drag-strip rule after `.sheet-handle`:

```css
.sheet-drag {
  touch-action: none;
  padding: 4px 0;
  cursor: grab;
}
```

In the existing `@media (min-width: 880px)` block that already styles `.sheet`, add:

```css
  .sheet-handle {
    display: none;
  }
```

In the existing `@media (prefers-reduced-motion: reduce)` block that already sets `.sheet { animation: none; }`, extend it to also drop the transition:

```css
@media (prefers-reduced-motion: reduce) {
  .sheet {
    animation: none;
    transition: none;
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/components/Sheet.test.tsx`
Expected: all PASS (the four new drag tests plus the four existing scrim/Escape/content tests).

- [ ] **Step 6: Full verification and commit**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: all green (integration needs Docker). The other component tests that render sheets (LogSightingFlow, App day/sighting, NotifyBell) are unaffected — the `Sheet` markup gains a wrapper div but its `role="dialog"` / content are unchanged.

```bash
git add src/components/Sheet.tsx src/components/Sheet.test.tsx src/index.css
git commit -m "feat: drag-down-to-dismiss on the modal sheets"
```
