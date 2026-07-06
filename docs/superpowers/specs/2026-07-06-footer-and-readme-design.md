# Footer + README Refresh — Design Spec

**Date:** 2026-07-06
**Status:** Approved
**Depends on:** current main (through the critter recuration #16).

## Purpose

Give the app a small attribution footer (copyright + a link to the author's
GitHub), and refresh the README so its feature summary and API list match what
the app actually does now, plus an author/license line.

## Part 1 — App footer

**Component** `app/src/components/Footer.tsx` (mirrors the tiny `Header.tsx`
pattern): a `<footer className="app-footer">` containing, centered and muted:

> © {year} · James Awesome

- `{year}` = `new Date().getFullYear()` — auto-updates, no yearly edit.
- "James Awesome" is a link to `https://github.com/JamesAwesome`, with
  `target="_blank"` and `rel="noopener noreferrer"`.
- Exact text: the copyright glyph `©`, then a space, the year, then ` · `, then
  the linked name. (The link text is just `James Awesome`; the `©`/year sit
  before it as plain text.)

**Placement:** rendered in `App.tsx` inside `.page`, immediately after the
closing `</div>` of `.shell` — so it sits on the page's gradient background
below the white card, not inside it. (The `Toast` stays after it as today.)

**Styling** — new rule in `app/src/index.css`:

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

(`--ink-secondary` and `--other-text` are existing tokens; no new tokens, no
raw hexes.)

**Testing** (`app/src/components/Footer.test.tsx`, plus one line in
`App.test.tsx` that the footer renders): assert the link has accessible name
`James Awesome` and `href="https://github.com/JamesAwesome"`, that it opens in a
new tab (`target="_blank"`, `rel` contains `noopener`), and that the copyright
text contains `©` and `James Awesome`. Do NOT assert the literal year (so the
test survives the calendar rollover); match `/©/` and the name instead.

## Part 2 — README refresh

Targeted edits to `README.md` (it is already fairly current — push, tunnel, and
most endpoints are present):

1. **Intro paragraph** (currently "…calendar, a filterable history, and a Top
   Critters leaderboard. Live (eventually) at nataliesawacritter.info."):
   broaden the feature list and mark it live. New wording:

   > Natalie sees things, she sees them with her eyes. This app lets her log
   > wildlife sightings — with photos and saved "critter friends" — and view
   > them as a calendar, a filterable history, and a Top Critters leaderboard.
   > Friends can subscribe to push notifications (it installs as a PWA on
   > phones) to hear about new sightings as they happen. Live at
   > nataliesawacritter.info.

2. **API list:** add the entry-gate endpoint (it exists as of PR #15) after the
   profiles block, before the push block:

   ```
   GET    /api/auth/check                                # basic auth; 204/401, 503 when writes disabled
   ```

3. **New "Author & license" section** at the very end of the file:

   ```markdown
   ## Author & license

   Made by [James Awesome](https://github.com/JamesAwesome). Licensed under
   GPL-3.0 — see [LICENSE](LICENSE).
   ```

No other README sections change.

## Scope boundaries

- Footer is presentation only — no new state, no data, no API. `Header.tsx` and
  the rest of `App.tsx` are untouched apart from mounting `<Footer />`.
- README changes are text-only; no code or config is described that doesn't
  already exist (the auth-check endpoint and PWA/push behavior are already
  shipped).

## Out of scope

Footer nav links, social icons, a "built with" credits list, theming the
footer, or restructuring the README beyond the three edits above.

## Definition of done

- The app shows `© <current year> · James Awesome` below the card, the name
  linking to github.com/JamesAwesome in a new tab.
- README intro reflects photos, friends, push, and PWA and says "Live at …";
  the API list includes `GET /api/auth/check`; an Author & license section
  links the GitHub profile and the GPL-3.0 LICENSE.
- Full suite, lint, typecheck, build green; CI green on the PR.
