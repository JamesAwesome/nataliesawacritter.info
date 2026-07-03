# Handoff: Natalie Saw a Critter! (nataliesawacritter.com)

## Overview
A responsive website for logging wildlife sightings. The primary user ("Natalie") logs a critter sighting by picking an emoji, then optionally adds a name, date/time, place, comment, and photo. Sightings are surfaced three ways: a monthly **Calendar**, a reverse-chronological **History** list (with date-range filtering), and a **Top Critters** leaderboard ranked by sighting count. Mobile-first, with a distinct desktop dashboard layout at wide viewports.

## About the Design Files
The file in this bundle (`Natalies Critter Tracker.dc.html`) is a **design reference built in HTML** — a working, click-through prototype showing the intended look, layout, and interaction behavior. It is not production code to copy verbatim. The task is to **recreate this design in the target codebase's actual environment** (React, Vue, Swift, etc.), using that codebase's existing component patterns, state management, and libraries. If no environment/framework exists yet for this product, choose the most suitable one and implement the design there.

The prototype uses a custom lightweight templating runtime (`support.js`, a proprietary internal tool) purely to enable live-editing in the design tool — **do not** try to reproduce that runtime or its `{{ }}` binding syntax in the real app. Treat the file as you would any static HTML/CSS/JS mockup: read the rendered structure/behavior, not the templating mechanism.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and interaction behavior are final/intentional. Recreate pixel-perfectly using the target codebase's tools.

## Visual System
- **Palette**: soft pastel rainbow ("Lisa Frank sticker book" but toned down — pastel, clean, minimal, not neon/maximalist). Named "Sticker Book" layout + "Rainbow Sherbet" color palette.
  - Page background gradient: `linear-gradient(180deg, #EAF6FF, #FDF1FF)` (pale sky blue → pale lilac)
  - Header/FAB rainbow gradient (used exactly in both places): `linear-gradient(90deg, #FFD1DC, #FFE1B8, #FFF6B8, #D7F5C8, #C8F0E4, #C7E3FA, #D9CFF2)` (pink → peach → yellow → mint → aqua → sky → lavender)
  - Calendar-card accent strip: `linear-gradient(90deg, #FFD6E8, #FFE9C7, #E8FFDB, #D3F0FF, #E6DBFF)`
  - Ink/text: `#4a3b63` (headings/primary text), `#9AA8C7` (secondary/meta text), `#AFC0DE` (tertiary, e.g. weekday labels)
  - Card surfaces: `#fff` on the gradient page bg; hairline borders `#E3ECFA`
  - Tab accent colors (active state): Calendar `#8FB8FF` (blue), History `#5FBFA6` (teal), Top Critters `#B79BF2` (lavender); inactive tab color `#9AA8C7`
  - Calendar "today" ring / cell-with-sightings background: ring `#8FB8FF`, filled bg `#F0F7FF`, empty bg `#fff`, out-of-month bg `#F5F8FC`
  - Save/primary-action gradient (Save sighting button): `linear-gradient(135deg, #8FD8C4, #8FB8FF)` (teal → blue)
  - Destructive (Delete): bg `#FFE3E3`, text `#D2555C`
  - Toast bg `#4a5f8e`, text white
  - Full rainbow bar-chart hues cycled for leaderboard bars: `['#FFD1DC','#FFE1B8','#FFF6B8','#D7F5C8','#C8F0E4','#C7E3FA','#D9CFF2']`
- **Typography**: Google Fonts "Fredoka" (weights 500/600/700) for all headings/titles/labels — rounded, bubbly, playful. "Quicksand" (weights 500/600/700) for body/UI text. Load both via the standard Google Fonts `<link>` (see file `<head>`).
- **Shape language**: large border radii throughout (12–26px on cards/sheets, 999px/pill on buttons and tab pills), soft box-shadows tinted blue-purple (e.g. `0 20px 50px rgba(70,90,140,0.22)` on the app shell, `0 4px 14px rgba(90,100,150,0.08)` on cards), no hard edges or heavy borders.
- **Iconography**: real emoji only (🦌🐿️🐦🐇🦋🐢🦉🦊🦝🦔🐸🦆 for the curated critter set, plus a secondary "more animals" emoji keyboard). No hand-drawn SVG icons. A single 🐾 paw emoji is used as the wordmark icon next to the title.

## Screens / Views

### 1. App Shell / Navigation
- Header: full-width band filled with the 7-stop rainbow gradient (listed above), rounded top corners (24px), centered title "🐾 Natalie Saw a Critter!" in Fredoka 600 18px, color `#4a3b63`.
- Tab bar directly below header, white background, 3 tabs (**Calendar**, **History**, **Top Critters**), equal width, underline style: 3px bottom border in the tab's accent color when active, `#9AA8C7` text when inactive, Quicksand 700 13px.
- Below the tab bar: a full-width "+ Log a sighting" button (mobile) or "+ Log a sighting" button anchored above the sidebar (desktop) — pill-free, rounded-14px, filled with the same 7-stop rainbow gradient, dark ink text, centered "+" glyph beside the label. This replaces a floating FAB (rejected during design — see Interactions notes).

### 2. Calendar (default/home tab)
- A white, rounded-18px card containing:
  - A 5px-tall decorative gradient strip at the very top of the card: `linear-gradient(90deg,#FFD6E8,#FFE9C7,#E8FFDB,#D3F0FF,#E6DBFF)`.
  - Month header row: circular prev/next chevron buttons (30px, bordered `#E3ECFA`, bg `#F0F7FF`) flanking the "Month YYYY" label (Fredoka 600 16px).
  - 7-column weekday header row (S M T W T F S), 11px 700 `#AFC0DE`.
  - 7-column × 6-row day grid. Each day cell: `aspect-ratio: 1`, rounded-12px, 1px border. Border/bg rules:
    - Default (in-month, no sightings): border `#E3ECFA`, bg `#fff`
    - In-month with ≥1 sighting: bg `#F0F7FF` (still border `#E3ECFA` unless it's also today)
    - Today: border becomes `#8FB8FF` (2px visual emphasis via border color, not width)
    - Out-of-month (leading/trailing days from adjacent months): bg `#F5F8FC`, 35% opacity, not clickable
  - Each cell shows: small day number (10px 700 `#9AA8C7`) top, then up to 2 emoji for that day's sightings, plus a "+N" text suffix if more than 2 (e.g. "🦌🐦 +1"). Cells with sightings are clickable → opens the **Day Detail** sheet/modal (below). Empty cells are not clickable.
- **Recent Critters** list directly under the calendar card (mobile only — on desktop this list moves to the persistent right sidebar instead, see Desktop Layout): heading "Recent Critters" (Fredoka 600 14px), then up to 4 rows, most-recent-first. Each row: white bg, rounded-14px, bordered `#E3ECFA`, containing emoji (20px) + critter name (13px 700) + "Mon D · time" meta (11px, `#9AA8C7`) + a trailing "›" chevron (`#C6D2EE`). Tapping a row opens **Sighting Detail**.

### 3. History tab
- **Date range filter**, directly under the tab bar: two native `<input type="date">` fields ("From" / "To", no labels — browser-native mm/dd/yyyy display), separated by a small "to" label, plus a "Clear" text button that only appears once a from/to value is set. Filtering is inclusive on both ends; either bound may be left empty for an open-ended range.
- Below the filter: a vertical list of ALL sightings (after filtering), most-recent-first, sorted by date then time. Each row: white bg, rounded-16px, bordered `#E3ECFA`, containing a large emoji (24px), critter name (14px 700), "Mon D · time" meta (12px `#9AA8C7`), trailing chevron. Tapping a row opens **Sighting Detail**.
- No grouping by date/day — a single flat list.

### 4. Top Critters tab
- Full, **uncapped** ranked list of every distinct critter emoji logged, ordered by sighting count descending. Row layout (CSS grid, columns `22px 28px 1fr auto`): rank marker, emoji, a horizontal bar, and the numeric count.
  - Rank marker: 🥇🥈🥉 medal emoji for #1–3, plain "#4", "#5", … text (13px 700 `#AFC0DE`) beyond that.
  - Bar: track bg `#EEF3FB`, height 10px, rounded-pill, filled proportionally to `count / maxCount` (minimum 8% width so low counts stay visible) with a 2-stop gradient — each row cycles through the 7-color rainbow array (index i and i+2, wrapping) so bars visually vary rainbow-to-rainbow down the list.
  - Count: 14px 700 `#4a3b63`, right-aligned.
- The right sidebar (desktop only) shows the SAME ranking logic but **capped to the top 10** rows, under a "Top Critters" heading — a lightweight preview, not the full list.

### 5. Log a Sighting flow (multi-step bottom sheet / modal)
Triggered by the "+ Log a sighting" button. Two steps, both inside one sheet/modal container (see "Sheet / Modal presentation" below for mobile vs desktop chrome differences):

**Step A — Emoji picker**
- Heading: "What did Natalie see?" (Fredoka 600 17px).
- 4-column grid of 12 curated critter emoji tiles (🦌 Deer, 🐿️ Squirrel, 🐦 Bird, 🐇 Rabbit, 🦋 Butterfly, 🐢 Turtle, 🦉 Owl, 🦊 Fox, 🦝 Raccoon, 🦔 Hedgehog, 🐸 Frog, 🦆 Duck). Each tile: aspect-square, rounded-14px, bordered `#E3ECFA`, background tinted with that critter's own pastel color (each critter has a fixed pastel hex — see Design Tokens), 22px emoji centered.
- A 13th "Other" tile: dashed border `#9DB6E8`, bg `#F0F7FF`, label text "Other" (12px 700, `#5F80C7`) — tapping it expands a secondary 6-column grid of 16 additional animal emoji (bee, snail, lizard, snake, bat, mouse, eagle, wolf, beaver, alligator, seal, flamingo, octopus, scorpion, ladybug, spider) below a divider, inline within the same step (not a new screen).
- Tapping any emoji (curated or "other") immediately advances to Step B with that emoji pre-selected.
- "Cancel" button at the bottom closes the whole flow.

**Step B — Optional details**
- Row: large emoji preview (34px) + a text input for "Critter name" pre-filled with the curated name (e.g. "Deer") or blank if picked from "Other".
- 2-column row: native date input (defaults to today) + free-text "Time" input (defaults blank; committed sightings without a time show "just now").
- Full-width "Where?" text input, placeholder "Where? (backyard, trail...)".
- Full-width comment textarea (2 rows), placeholder "Comment (optional)".
- A photo toggle affordance: a dashed-border button, default label "📷 Add a photo" (border `#9DB6E8`/text `#5F80C7`), which toggles to a solid "photo added" state — border/text `#5FBFA6`/`#3E9C81`, bg `#EFFAF3` — when tapped. This is a **placeholder toggle only** in the prototype; production should wire it to a real image upload/attach control.
- Footer buttons: "Back" (returns to Step A, keeps nothing from step B) and "Save sighting" (primary, teal→blue gradient) which commits the new sighting to the top of every list, closes the sheet, and shows a toast "🎉 Logged!" for ~1.8s.
- All fields except the emoji are optional — a sighting can be saved with just an emoji.

### 6. Day Detail (sheet/modal)
- Triggered by tapping a calendar cell that has ≥1 sighting.
- Heading: the date, formatted "Mon D" (e.g. "Jul 2").
- A list of that day's sightings (emoji, name, time), each tappable → opens **Sighting Detail** (with a "back" path that returns here, not to Calendar).
- "Close" button.

### 7. Sighting Detail (sheet/modal)
- Reached from History rows, Recent Critters rows, Top Critters is not a source (leaderboard rows aren't tappable), and Day Detail rows.
- Centered header: large emoji (44px), name (Fredoka 600 18px), "Mon D · time" (13px `#9AA8C7`).
- Conditionally rendered (only if present): 📍 place line (bold), a photo placeholder block (120px tall, diagonal-striped pastel pattern, monospace "photo" caption — swap for the real photo `<img>` in production), and a comment block (13px, on a tinted panel).
- Footer: "Back" (returns to Day Detail if opened from there, otherwise closes) and a destructive "Delete" button (bg `#FFE3E3`, text `#D2555C`) which removes the sighting entirely and closes the sheet.

## Desktop Layout (≥ ~880px wide)
The same screens/data are reflowed into a dashboard rather than a single mobile column:
- Outer container: `max-width: 1100px`, centered, `padding: 32px 24px 60px`.
- Header + tab bar span the full container width, unchanged visually from mobile.
- Below the tab bar, a two-column flex row (`gap: 24px`):
  - **Main column** (`flex: 1`): the active tab's content (Calendar card + its Recent Critters list is hidden here — see below; History filter+list; or the full uncapped Top Critters ranking), plus the "+ Log a sighting" button pinned above the tab content.
  - **Right sidebar** (fixed `280px`, only rendered at desktop widths): a persistent "+ Log a sighting" button, a "Recent Critters" list (same 4 most-recent rows as the mobile inline version), and a "Top Critters" preview (same ranking, capped to top 10). This sidebar is visible regardless of which tab is active in the main column.
- The mobile-only inline "Recent Critters" block under the calendar card is suppressed on desktop (it would duplicate the sidebar).
- Detection of desktop vs. mobile should be a real container/viewport width check (in the prototype this is implemented via `ResizeObserver` on the content box, specifically to avoid relying on `window.innerWidth` in embedded/scaled contexts — in a normal production app a CSS media query at `880px` is the simplest equivalent, e.g. a two-column grid at `min-width: 880px`).

## Sheet / Modal presentation (shared across steps 5–7)
One overlay implementation is reused for the emoji picker, details form, day detail, and sighting detail — only the inner content differs by step.
- Overlay: full-viewport, semi-transparent `rgba(70,90,140,0.28)` scrim.
- **Mobile**: bottom sheet — pinned to the bottom edge, full width, top corners rounded 26px, slides up.
- **Desktop**: centered modal — max-width 460px, all corners rounded 24px, vertically and horizontally centered in the viewport.
- A small pill-shaped drag handle (36×5px, `#E3ECFA`) sits at the top of the sheet purely as a visual affordance (non-functional in the prototype; wire up real swipe-to-dismiss on mobile in production if desired).

## Interactions & Behavior
- Tab switching is instant, client-side, no transitions specified.
- Calendar prev/next month arrows step the visible month; no bounds (can navigate indefinitely in either direction).
- New sightings are always inserted at the top/most-recent position across History, Recent Critters, and recalculate Top Critters counts immediately.
- The floating circular FAB pattern was explicitly tried and rejected during design (it overlapped the desktop sidebar/leaderboard content in several attempts) — the final, approved pattern is the inline "+ Log a sighting" button described above. Do not reintroduce a fixed/floating action button without checking overlap at all breakpoints.
- Toast confirmation ("🎉 Logged!") auto-dismisses after ~1.8s; no manual dismiss control.
- Deleting a sighting is immediate (no confirmation step in the prototype) — consider adding a confirmation or undo affordance in production.

## State Management
Core state needed to reproduce this UI:
- `sightings`: array of `{ id, emoji, name, date (YYYY-MM-DD), time (free string), place, comment, hasPhoto }`. In production, `hasPhoto` should become a real photo URL/attachment reference.
- `activeTab`: `'calendar' | 'history' | 'leaderboard'`
- `visibleMonth`: `{ year, month }` for calendar navigation
- `sheet`: which step/modal is open — `null | 'emoji' | 'details' | 'day' | 'sighting'`, plus a transient `draft` object while composing a new sighting, `selectedDate` (for Day Detail), and `selectedSighting` (for Sighting Detail) with a flag for whether it was opened via Day Detail (so "Back" returns there vs. closing entirely).
- `filterFrom` / `filterTo`: optional ISO date strings for the History range filter.
- `isDesktop`: derived boolean from container width, drives the layout branch described above.
- Derived/computed (recompute from `sightings`, don't store): calendar grid cells for the visible month, history rows (sorted + filtered), leaderboard ranking + counts, "recent" slice (last 4).

## Design Tokens

### Colors
| Token | Hex | Usage |
|---|---|---|
| Page gradient start | `#EAF6FF` | body background top |
| Page gradient end | `#FDF1FF` | body background bottom |
| Ink primary | `#4a3b63` | headings, primary text |
| Ink secondary | `#9AA8C7` | meta text, inactive tabs, placeholders |
| Ink tertiary | `#AFC0DE` | weekday labels, rank numbers |
| Border hairline | `#E3ECFA` | card/input borders |
| Surface / input fill | `#F0F7FF` | input backgrounds, filled calendar cells |
| Out-of-month fill | `#F5F8FC` | calendar cells outside current month |
| Tab accent — Calendar | `#8FB8FF` | active tab underline/text, today ring |
| Tab accent — History | `#5FBFA6` | active tab underline/text |
| Tab accent — Top Critters | `#B79BF2` | active tab underline/text |
| Success/photo-added | `#5FBFA6` / `#3E9C81` / `#EFFAF3` | photo toggle "on" state |
| Danger | `#D2555C` / `#FFE3E3` | delete button |
| Toast | `#4a5f8e` bg / `#fff` text | confirmation toast |
| Rainbow (7-stop, cycled for bars & gradients) | `#FFD1DC #FFE1B8 #FFF6B8 #D7F5C8 #C8F0E4 #C7E3FA #D9CFF2` | header, FAB/log button, calendar strip, leaderboard bars |
| Critter tile tints | `#FFD1DC` Deer/Raccoon · `#FFE1B8` Squirrel/Hedgehog · `#FFF6B8` Bird · `#D7F5C8` Rabbit/Frog · `#C8F0E4` Butterfly · `#C7E3FA` Turtle/Duck · `#D9CFF2` Owl · `#F3CDEE` Fox | emoji picker tile backgrounds |

### Typography
- Headings/labels: **Fredoka**, weights 500/600/700
- Body/UI text: **Quicksand**, weights 500/600/700
- Scale used: 10–11px (micro labels) / 12–13px (meta) / 14–16px (body/list titles) / 17–18px (sheet/section headings) / 34–44px (emoji hero display in Sighting Detail / draft preview)

### Radii
12px (calendar cells) · 14px (tiles, list rows, buttons) · 16px (history rows) · 18px (calendar card) · 24–26px (sheet/modal) · 999px / pill (tab-pill-style buttons, bar tracks, avatar circles where used)

### Shadows
- App shell / elevated container: `0 20px 50px rgba(70,90,140,0.22)`
- Cards: `0 4px 14px rgba(90,100,150,0.08)`
- FAB-style buttons (if reintroduced): `0 8px 20px rgba(143,184,255,0.45)`

## Assets
No image/icon assets — all iconography is native emoji rendered via system font. No custom illustrations, photos, or SVGs are used; the "photo" attachment in Sighting Detail and the details form are placeholder blocks (diagonal pastel stripes + monospace caption) standing in for real user-uploaded photos.

## Screenshots
Reference screenshots (mobile widths) are included in `screenshots/`:
- `calendar.png` — Calendar tab (home)
- `history-filter.png` — History tab with the date-range filter
- `top-critters.png` — Top Critters leaderboard
- `log-sighting.png` — Log a Sighting flow (emoji picker step, in its sheet)

The desktop two-column dashboard (sidebar + wider main column, described above under "Desktop Layout") isn't captured as a static image here — open `Natalies Critter Tracker.dc.html` directly in a browser and widen the window past ~880px to see it live.

## Files
- `Natalies Critter Tracker.dc.html` — the full interactive prototype (single file). Open directly in a browser to explore all screens/breakpoints. Search within it for the section comments/step names referenced above (e.g. the emoji-picker grid, the calendar cell logic, the desktop sidebar block) to see exact structure and inline styles.
- `screenshots/` — static reference images, see above.
