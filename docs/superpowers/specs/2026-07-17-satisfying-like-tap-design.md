# Satisfying Like Tap — Design

**Status:** design approved via brainstorm; implementing directly (small, contained).
**Date:** 2026-07-17

## Goal

Make tapping the like heart feel satisfying: a springy pop animation (primary,
universal), plus haptic feedback as an Android progressive enhancement. No sound.

## Platform reality (why the shape is what it is)

- **Animation** works on every device and carries the feel — the primary lever.
- **Haptics:** the Web Vibration API (`navigator.vibrate`) is Android/Chrome
  only; **iOS Safari does not support it.** Added as progressive enhancement (a
  real buzz for Android visitors, a silent no-op on iPhone).
- **Sound:** intentionally skipped (owner's call). Can layer in later with an
  HTML `<audio>` element (which honors the iOS silent switch).

## Decisions

1. **Animation — springy pop + fill.** On a *new* like (🤍→❤️), the heart glyph
   pops: `scale 1 → 1.4 → 0.92 → 1` (~280ms, bouncy). Uses `transform` only, so
   it **cannot reflow the row**. Fires only on the user's own like tap — not on
   unlike, not on a background count refresh, not on first render of an
   already-liked row. Suppressed under `prefers-reduced-motion` (instant fill).
2. **Unlike is quiet** — no pop, no celebratory haptic (removing a like isn't a
   reward).
3. **Haptics** — a `tapFeedback()` helper calling `navigator.vibrate?.(15)` on a
   new like; feature-guarded, no-op where unsupported.
4. **Shared `LikeButton` component** — the heart+count JSX is currently
   duplicated in `SightingRow` and `SightingDetail`. Extract a `<LikeButton
   sighting onToggle>` that owns the heart, count, pop state, and haptic, so both
   the feed rows and the detail view get identical behavior from one place.

## Components & files

- **Create `src/lib/haptics.ts`** — `tapFeedback(): void` → `navigator.vibrate?.(15)`.
- **Create `src/components/LikeButton.tsx`** — props `{ sighting: Sighting;
  onToggle: (s: Sighting) => void }`. Computes `liked = hasLiked(sighting.id)`
  and `displayName`; local `popping` state cleared by a ref-guarded ~300ms
  timeout (deterministic; also correct under reduced-motion where no
  `animationend` fires). On click: if not currently liked → `tapFeedback()` +
  start pop; always `onToggle(sighting)`. Renders the exact same button markup as
  today (`like-button`/`liked`/`popping` classes, `aria-pressed`, `aria-label`
  Like/Unlike `<name>`, `.like-heart` span, `.like-count` when > 0).
- **Modify `SightingRow.tsx` / `SightingDetail.tsx`** — replace the inline like
  button with `{onToggleLike !== undefined && <LikeButton sighting={sighting}
  onToggle={onToggleLike} />}`; drop the now-unused `hasLiked` import and local
  `liked`.
- **Modify `src/index.css`** — `@keyframes like-pop`, `.like-heart { display:
  inline-block; }`, `.like-button.popping .like-heart { animation: like-pop
  280ms ease-out; }`, and a `prefers-reduced-motion: reduce` rule setting that
  animation to `none`.

## Non-goals

- Sound (deferred).
- iOS haptic hacks (the `<input switch>` trick) — too fragile.
- Count roll-up / burst animation (chose the clean pop).
- Animating unlike.

## Testing

- `haptics.test.ts` — vibrates with 15 when `navigator.vibrate` exists; no-op /
  no throw when absent.
- `LikeButton.test.tsx` — like tap adds `popping` + calls `tapFeedback` + fires
  `onToggle`; unlike tap (pre-seed `markLiked`) does **not** add `popping` and
  does **not** vibrate; `popping` clears after the timeout (fake timers); aria
  and count render correctly.
- Existing `SightingRow` / `SightingDetail` / `App.likes` tests keep passing
  (DOM markup unchanged by the extraction).
- **Render gate:** screenshot the heart at peak scale (inject the transform) and
  confirm the row's height and neighbors don't shift vs baseline.
</content>
