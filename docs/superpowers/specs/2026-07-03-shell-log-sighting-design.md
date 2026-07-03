# App Shell + Log a Sighting — Design Spec

**Date:** 2026-07-03
**Status:** Approved
**Depends on:** sightings API (docs/superpowers/specs/2026-07-03-sightings-api-design.md, merged PR #4)
**Design source:** docs/design/README.md (high-fidelity handoff — colors, type, spacing, and interactions are final; recreate faithfully)

## Purpose

Make the app usable: Natalie logs sightings from her phone. This cycle delivers the
app shell (header, tabs, responsive layout, reusable sheet) and the two-step
log-a-sighting flow, plus the Recent Critters list for immediate feedback. Real data
starts accumulating so the calendar cycle lands on real content.

Sequencing decision (cycles after this one): calendar + day detail + sighting
detail → history + top critters → photo upload.

## Decisions (alternatives considered)

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Cycle scope | Shell + log flow + Recent Critters | Calendar-first (beautiful empty grid, no way to fill it); combined mega-cycle (slower first landing) |
| Auth UX | Prompt on first save; store `{user: 'natalie', password}` in localStorage; Basic header on writes; 401 clears + re-prompts | Login screen (ceremony, blocks read-only visitors); defer (undermines the cycle's point) |
| Client state | `api.ts` typed fetch client + `useSightings` hook; derived views from one array | TanStack Query (dependency overkill); context/reducer store (premature) |
| Desktop | Responsive frame now — two-column at ≥880px, sidebar has log button + Recent Critters; Top-10 slot arrives with leaderboard cycle | Mobile-only (shell rebuilt later) |
| Photo control | Omitted this cycle (arrives with photo upload) | Shipping the handoff's placeholder toggle as a dead control |
| Placeholder panes | Calendar/History/Top Critters tabs render styled "coming soon" panes | Hiding tabs (shell wiring untested until later cycles) |

## What ships

### Shell (per handoff §1 App Shell / Navigation + §Desktop Layout)

- App container: white shell card, rounded 24px top, shadow `0 20px 50px rgba(70,90,140,0.22)`, on the page gradient. Mobile-first single column; at `min-width: 880px` a two-column flex row (`max-width: 1100px`, gap 24px): main column (`flex: 1`) + fixed 280px sidebar.
- Header: 7-stop rainbow gradient band, centered "🐾 Natalie Saw a Critter!" (Fredoka 600 18px, ink `#4a3b63`).
- Tab bar: white, 3 equal tabs — Calendar / History / Top Critters — 3px bottom-border in the tab's accent when active (`#8FB8FF` / `#5FBFA6` / `#B79BF2`), inactive text `#9AA8C7`, Quicksand 700 13px. Instant client-side switching.
- "+ Log a sighting": full-width rounded-14px button filled with the same rainbow gradient, ink text. Mobile: below the tab bar. Desktop: top of the sidebar (and NOT duplicated in the main column). Never a floating FAB (explicitly rejected in the handoff).
- Tab panes this cycle: each renders a styled placeholder card ("Coming soon 🐾"-style, on-brand) — real panes arrive in later cycles.
- Sidebar (desktop only): log button + Recent Critters. The Top-10 preview section is NOT built this cycle; the sidebar simply doesn't render it yet.
- Recent Critters (handoff §2): heading Fredoka 600 14px; up to 4 rows, most-recent-first; each row white, rounded-14px, border `#E3ECFA`: emoji 20px + name 13px 700 + "Mon D · time" meta 11px `#9AA8C7` + "›" chevron `#C6D2EE`. Mobile: in the main column (under the future calendar's slot). Desktop: sidebar only. Rows are not tappable this cycle (Sighting Detail is next cycle); the chevron renders per design but the row is inert.
- The health-status paragraph from the skeleton is removed from the page (the `/api/health` endpoint stays; the UI no longer surfaces it).

### Sheet component (handoff §Sheet / Modal presentation)

One reusable overlay for this and future cycles: scrim `rgba(70,90,140,0.28)`;
mobile bottom sheet (full width, top corners 26px, slides up); desktop centered
modal (max-width 460px, rounded 24px); non-functional pill drag handle (36×5px,
`#E3ECFA`). Closes on scrim tap and Escape. Content is a child — day detail and
sighting detail reuse this in the next cycle.

### Log a Sighting flow (handoff §5)

Step A — emoji picker: "What did Natalie see?" (Fredoka 600 17px); 4-column grid of
the 12 curated critters (🦌 Deer, 🐿️ Squirrel, 🐦 Bird, 🐇 Rabbit, 🦋 Butterfly,
🐢 Turtle, 🦉 Owl, 🦊 Fox, 🦝 Raccoon, 🦔 Hedgehog, 🐸 Frog, 🦆 Duck), each tile
aspect-square rounded-14px with its fixed pastel tint from the handoff token table;
13th "Other" tile (dashed `#9DB6E8`, bg `#F0F7FF`, text `#5F80C7`) expands an inline
6-column grid of the 16 extra emoji (bee, snail, lizard, snake, bat, mouse, eagle,
wolf, beaver, alligator, seal, flamingo, octopus, scorpion, ladybug, spider) below a
divider. Tapping any emoji advances to Step B with it selected. Cancel closes the flow.

Step B — details: emoji preview (34px) + name input pre-filled with the curated name
(blank if from "Other"); date input defaulting to today + free-text time input;
"Where? (backyard, trail...)" input; comment textarea (2 rows). No photo control this
cycle. Footer: "Back" (returns to Step A, discards Step B input) and "Save sighting"
(teal→blue gradient `linear-gradient(135deg, #8FD8C4, #8FB8FF)`).

Save: POST via `api.createSighting` (only emoji + sightedOn required — matches API);
on 201, insert returned row at top of state, close sheet, toast "🎉 Logged!" ~1.8s.

### Auth UX

- `auth.ts`: `getCredentials()` / `setCredentials(password)` (user is always
  `natalie`) / `clearCredentials()` over localStorage key `critter-write-auth`;
  `basicHeader(creds)`.
- On Save with no stored credentials: `PasswordPrompt` opens inside the sheet flow —
  on-brand small dialog, one password field, Save/Cancel. Entered password is stored,
  then the POST proceeds.
- POST returns 401 → clear stored credentials, reopen the prompt with an "wrong
  password" note, draft untouched. 503 (writes disabled server-side) → error toast
  ("Saving is disabled right now"), sheet stays open. Network/500 → error toast,
  sheet stays open, draft preserved. 400 → error toast (client keeps inputs; the
  client's own required-field gating makes this unexpected).

### Client modules

```
app/src/
├── api.ts               listSightings(range?) / createSighting(fields, header) — typed
│                        against the wire contract; throws ApiError { status } on non-2xx
├── auth.ts              credentials storage + Basic header
├── hooks/useSightings.ts  { sightings, status: 'loading'|'ready'|'error', addSighting }
│                        GET on mount; addSighting(fields, authHeader) POSTs and
│                        prepends the returned row. Credential presence/prompting is
│                        the FLOW's job (via auth.ts) — the hook just takes a header
├── lib/critters.ts      curated 12 + extended 16: { emoji, name, tint? } (tints from
│                        handoff token table; extended set has no tint/name pre-fill)
├── lib/format.ts        formatWhen(sightedOn, sightedTime): "Mon D · 4pm" / "Mon D · just now"
├── App.tsx              shell composition: header, tabs, active pane, sheet state
└── components/          Header, Tabs, LogButton, Sheet, LogSightingFlow, EmojiPicker,
                         DetailsForm, RecentCritters, PasswordPrompt, Toast, PlaceholderPane
```

`index.css` grows the full token set (tab accents, tile tints, save gradient, danger,
toast colors) as CSS custom properties; components use the tokens, not raw hexes.

## Error handling

- Initial GET fails → Recent Critters area shows an inline on-brand error state
  ("Couldn't load sightings 😿" + retry button that re-runs the fetch).
- All write-path errors per Auth UX above. No error ever silently discards the draft.

## Testing (jsdom + Testing Library, stubbed fetch — established pattern)

- `api.ts`: unit tests — URL/query construction, ApiError status propagation, body shape.
- `auth.ts`: credential lifecycle against localStorage (jsdom provides it).
- Components: tab switching renders the right pane + accent; sheet opens/closes
  (scrim, Escape); picker → step B with pre-filled name (curated) / blank (Other);
  "Other" expands inline; date defaults to today; Back returns to picker; full save
  happy path (POST body asserted, row appears in Recent Critters, toast shown);
  no-credentials → prompt → save proceeds; 401 → credentials cleared + re-prompt with
  draft intact; 503/network → toast + sheet stays open; recent list formatting
  ("Mon D · just now" when no time); loading + error + retry states for the list.
- Cycle opens with a test-hygiene commit (from PR #4's independent review): shared
  Testcontainers setup consolidating the 3 per-file container boots, shared `basic()`
  auth-header helper in testUtils, and routes.test.ts's mirrored error middleware
  replaced (import or minimal shared helper) so it can't drift from app.ts again.

## Out of scope (later cycles)

Calendar grid + day detail · sighting detail + delete · history filter/list ·
top critters + sidebar top-10 · photo upload (incl. the details-form photo toggle) ·
swipe-to-dismiss on the sheet.

## Definition of done

- On a phone-width viewport: open site → tap "+ Log a sighting" → pick 🦊 → save →
  password prompted (first time) → "🎉 Logged!" → Fox appears at the top of Recent
  Critters. Desktop ≥880px shows the two-column layout with the sidebar.
- Wrong password path verified (401 → re-prompt, draft intact).
- All tests green (`pnpm test`), lint/typecheck/build green, CI green on the PR.
- Visual check against `docs/design/screenshots/log-sighting.png` and the prototype's
  shell at both breakpoints.
