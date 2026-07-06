# Swipe-to-Dismiss Sheets — Design Spec

**Date:** 2026-07-06
**Status:** Approved
**Depends on:** current main (through the critter recuration #16).
**Reference implementation:** `pool_monitor` →
`dashboard/src/components/BottomSheet/BottomSheet.tsx` (drag-from-handle,
native touch listeners, `translateY` follow, distance threshold, desktop
opt-out). We adapt its mechanics onto this app's existing shared `Sheet`.

## Purpose

On phones, the modal sheets can only be dismissed by tapping the scrim, the
Cancel button, or Escape. Add the expected native gesture: drag the sheet down
by its handle to flick it away. Because every modal (log flow, day detail,
sighting detail, the iOS install sheet) renders through the shared
`app/src/components/Sheet.tsx`, this lands in one component and covers them all.

## Decisions (alternatives considered)

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Drag anchor | Top handle strip only (~44px hit zone around the grabber) | Whole-sheet drag (fights content scroll on tall sheets; would need "only when scrolled to top" logic) |
| Dismiss trigger | Distance threshold, 100px (matches pool_monitor) | Velocity/flick detection (more code; distance is proven and predictable) |
| Touch handling | Native `addEventListener` with `touchmove` `passive:false` so it can `preventDefault` | React synthetic `onTouchMove` (React attaches touch listeners as passive; can't `preventDefault` to stop the page scrolling under the drag) |
| Desktop | Swipe disabled, handle hidden at ≥880px (centered dialog) | Enabling drag on a centered desktop modal (no bottom edge to swipe to; odd) |
| Scope | The shared `Sheet` only | Per-caller wiring (unnecessary — all sheets share the component) |

## Component behavior (`Sheet.tsx`)

Add drag state and native touch handling; nothing about the existing
scrim-click / Escape / `pointerDown`-tracking behavior changes.

- **Refs & state:** a `sheetRef` on the `.sheet` div, a `dragRef` on the new
  handle strip, `dragStartY` (ref), `isDragging` (ref), `dragOffset` (state,
  px). An `onCloseRef` latest-ref updated in an effect (pool_monitor's pattern)
  so the touch effect never re-subscribes when `onClose` identity changes.
- **Gate:** the whole drag feature is off when `useIsDesktop()` is true — the
  touch-listener effect returns early, so desktop attaches nothing.
- **Touch effect** (native listeners on `sheetRef.current`, re-run on `open`):
  - `touchstart` (passive): if the touch target is inside `dragRef`, record
    `dragStartY = touch.clientY` and set `isDragging = true`.
  - `touchmove` (`passive:false`): if dragging, `preventDefault()` and
    `setDragOffset(Math.max(0, touch.clientY - dragStartY))` — downward only.
  - `touchend` (passive): if dragging, clear `isDragging`; if the final offset
    `> 100` call `onCloseRef.current()`, then reset `setDragOffset(0)`.
- **Reset:** `dragOffset` resets to 0 whenever `open` becomes false (and on the
  dismiss path above), so a reopened sheet starts undisplaced.
- **Applied styles** (inline, keyed purely off `dragOffset`):
  - `.sheet`: when `dragOffset > 0`, `{ transform: translateY(offset),
    transition: 'none' }`; when `dragOffset === 0`, `{ transform:
    'translateY(0)' }` (no inline transition) so the CSS `transition: transform`
    animates it home on release. Because the displaced frame was already painted
    with `transition:none`, dropping to offset 0 lets the CSS transition run the
    spring-back from the last position.
  - `.sheet-scrim`: when `dragOffset > 0`, `{ opacity: max(0.15, 1 - offset /
    300) }`; otherwise no inline opacity — the backdrop fades as the sheet is
    pulled down and returns on release.

Dismiss via swipe calls the same `onClose` the caller already passes, so all
existing teardown (LogSightingFlow's `write.abandon()` + state reset, App's
`setSheet(null)`, NotifyBell's `setSheetOpen(false)`) runs unchanged.

## Markup & CSS

- **Markup:** wrap the existing `.sheet-handle` in a `.sheet-drag` strip
  (`<div className="sheet-drag" ref={dragRef}>` containing the handle). The
  strip is the touch target; the visible grabber is unchanged.
- **CSS** (`app/src/index.css`):
  - `.sheet-drag { touch-action: none; padding: 4px 0; cursor: grab; }` — the
    padding + the handle's own margin give a ~44px tall hit area; `touch-action:
    none` stops the browser claiming the vertical gesture for scroll.
  - `.sheet { transition: transform 0.22s ease-out; }` added to the existing
    rule — the spring-back; suppressed inline during active drag.
  - At `@media (min-width: 880px)`: `.sheet-handle { display: none; }` (and the
    strip collapses) — desktop is a centered dialog with no swipe.
  - Under `@media (prefers-reduced-motion: reduce)`: also set `.sheet {
    transition: none; }` so the spring-back snaps instead of animating (the
    finger-follow itself stays — it's direct manipulation, not decoration).

## Testing (`Sheet.test.tsx`, jsdom)

Touch events via `fireEvent.touchStart/touchMove/touchEnd` (they reach the
native listeners). Default test env has no `matchMedia`, so `useIsDesktop()` is
false → mobile/drag-enabled by default; the desktop case uses the existing
`stubMatchMedia(true)` helper.

- Dragging the handle strip past threshold dismisses: `touchStart` on the drag
  strip, `touchMove` to `clientY` +150, `touchEnd` → `onClose` called once.
- Short drag springs back: same but +40 → `onClose` NOT called (and the sheet
  is still in the document).
- A touch that starts in the content (not the strip) does not drag: `touchStart`
  on the content, `touchMove` +150, `touchEnd` → `onClose` NOT called.
- Desktop attaches no drag: `stubMatchMedia(true)`, render, drag the strip past
  threshold → `onClose` NOT called.
- All existing Sheet tests (scrim click, Escape, press-in-content) stay green.

Add a `data-testid="sheet-drag"` on the strip for a stable test handle.

## Scope boundaries / out of scope

- No change to any sheet's contents, callers, or `onClose` semantics.
- No velocity/flick, no horizontal swipe, no drag-to-expand, no snap points.
- No new dependencies.

## Definition of done

- On a phone, dragging any sheet down by the handle moves it with the finger and
  fades the scrim; releasing past ~100px dismisses it, a short drag springs it
  back. Scrim-tap, Cancel, and Escape still dismiss.
- Desktop (≥880px) is unchanged: centered dialog, no handle, no drag.
- Full suite, lint, typecheck, build green; CI green on the PR.
