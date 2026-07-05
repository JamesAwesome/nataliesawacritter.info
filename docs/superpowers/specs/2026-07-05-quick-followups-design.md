# Quick Followups — Design Spec

**Date:** 2026-07-05
**Status:** Approved
**Depends on:** photo cycle (PR #10 / 346d02f). All design-handoff features are built;
this cycle clears the deferred ledger accumulated across the PR #8–#10 reviews before
the friend-highlighting feature.

## Purpose

Ten small, independent improvements: two user-visible (keyboard access to the photo
pickers, sheet-state self-healing), four hardening, four code-health. No new product
surface; every item carries its own test.

## Items

### UX / a11y

1. **Keyboard-operable photo pickers.** The hidden file inputs in `PhotoControl` and
   SightingDetail's Replace control use `display: none`, which removes them from the
   tab order — Add/Replace photo are mouse/touch-only. Replace with the
   visually-hidden clip pattern (new `.visually-hidden-input` class: absolute,
   1px, clip-path inset(50%), opacity 0) so the inputs are focusable and
   Enter/Space-activatable while the labels keep their current look (plus a
   `:focus-within` ring on the label using the existing focus treatment).
   Test: inputs are reachable via tab (not `display:none`), labels still render
   identical copy; existing upload tests unchanged.

2. **Sheet-state self-healing.** `App`'s `sheet` state can reference a sighting id
   that no longer exists in `sightings` (removal outside the delete path). Today the
   detail branch renders nothing/ghost. Change the sighting-sheet branch: if
   `sheet.kind === 'sighting'` and the id resolves to no row, fall back to `null`
   (close the sheet) via a derived check before rendering — no effect loops, pure
   render-time guard. Test: open detail, applySighting-style removal of that row from
   state, sheet closes.

### Hardening

3. **`X-Content-Type-Options: nosniff`** on `GET /api/photos/:filename` responses
   (set alongside the cache header). Guards against a credential-holder curl-ing
   non-JPEG bytes that a browser might sniff. Test: header asserted in the existing
   GET test.

4. **`isUniqueViolation` depth cap.** The cause-chain walk in
   `app/server/profiles/store.ts` gets a max depth (8) so a pathological cyclic
   `cause` can't spin. Behavior otherwise identical. Test: cyclic-cause object
   returns false (unit).

5. **Leaderboard emoji tiebreak.** `lib/insights.ts`'s final comparator uses JS
   `<` on strings (UTF-16 code units — wrong order across the surrogate boundary).
   Replace with a pure codepoint-sequence compare: `Array.from(a)` vs `Array.from(b)`,
   element-wise `codePointAt(0)` difference, length as the final tiebreak — fully
   deterministic, no locale dependence. Test: a pair that misorders under UTF-16
   `<` (e.g. `'！'` vs `'😀'` — FF01 > D83D unit-wise but U+FF01 < U+1F600)
   orders by codepoint.

6. **Bar-width rounding.** `LeaderboardList` writes raw floats into the width style
   (`43.33333333333333%`). Round to 2 decimals via `Math.round(pct * 100) / 100`.
   Test: style attribute matches the rounded value.

### Code health (no behavior change)

7. **`FRIEND_MESSAGES` hoist.** SightingDetail's friend-run message override object
   is duplicated at the add and remove call sites; hoist to a module const next to
   `PHOTO_MESSAGES`. Covered by existing tests.

8. **`PickerTile` sub-component.** EmojiPicker's tile markup exists four times
   (curated / recent / extended / friends). Extract one
   `PickerTile({ className?, ariaLabel, onClick, children })` used by all four rows;
   rendered DOM identical (existing EmojiPicker tests prove it).

9. **Fixture id separation.** `makeSighting` keeps `8000-` ids; `makeProfile` moves
   to `9000-` (`00000000-0000-4000-9000-…`) so the two sequences can never collide.
   Update any test that pinned a `makeProfile` id shape (none expected — they
   reference `MR_FOX.id`).

10. **App-level `onUploadPhoto` wiring test.** One App test: stub URL-routed fetch,
    log a sighting with a (mocked-downscale) photo, assert the PUT fires and the
    sighting row in state gains the returned `photoPath` (i.e. `applySighting` ran).

## Out of scope

Friend highlighting (next cycle) · `useResource<T>`/api-factory (await a third
resource) · `--photo-*` token consolidation (intentional semantic decoupling) ·
delete-button rest color (handoff-specified).

## Definition of done

- Tab reaches the photo pickers; Enter opens the OS file dialog (manual browser check).
- All ten items landed, each with its named test; DOM/behavior identical everywhere
  except items 1–3.
- Full suite, lint, typecheck, build green; CI green on the PR.
