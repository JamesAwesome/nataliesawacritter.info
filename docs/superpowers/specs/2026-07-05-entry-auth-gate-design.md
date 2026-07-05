# Entry Auth Gate — Design Spec

**Date:** 2026-07-05
**Status:** Approved
**Depends on:** prior cycles through push notifications (PR #14 / 9e00191).

## Purpose

Tapping "+ Log a sighting" without a saved password currently opens the full
picker → details flow, and the password wall only appears at save time — a
friend (or Natalie with a typo'd device) can build a whole sighting they can't
save. Move the gate to the front door: the sheet asks for the magic word
*before* showing the critter picker, and verifies it with the server so a wrong
password fails immediately instead of at the end. Courtesy, not secrecy — the
button stays visible to everyone.

## Decisions (alternatives considered)

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Gate location | Inside LogSightingFlow: prompt renders in place of the picker step when no stored credentials | Gate at the App button (prompt needs a new host, App gains auth logic, two button instances to wire); hiding the button (secrecy — confuses legitimate users; goal is stopping wasted effort) |
| Verification | Server-verified at prompt time via new `GET /api/auth/check` | Presence-only storage (typo'd password still wastes effort; verification costs one 4-line endpoint) |
| Stored-credentials path | Open the picker immediately, no network check | Always-verify-on-open (adds a round-trip to the 99% case; stale credentials are already caught by the save-time 401 machinery) |
| Save-time machinery | Untouched — remains the backstop for stale passwords and for delete/photo/friend actions | Removing it (stale stored password would dead-end); moving other actions' gates (out of scope per request) |

## Server

In `app/server/app.ts`, before the routers:

```ts
app.get('/api/auth/check', writeGate, (_req, res) => {
  res.status(204).end()
})
```

Behavior falls out of existing middleware: **204** with valid basic auth,
**401** with missing/wrong credentials (`requireWriteAuth`), **503**
`{ error: 'writes disabled' }` when write credentials are unconfigured. No new
router file.

## Client

**`api.ts`:** `checkAuth(authHeader: string): Promise<void>` — `GET
/api/auth/check` with the `authorization` header; resolves on ok, throws
`ApiError(status)` otherwise (house style).

**`LogSightingFlow`** gains an entry gate evaluated each time the sheet opens:

- `getCredentials() !== null` → exactly today's behavior: picker immediately,
  zero network.
- `getCredentials() === null` → render the existing `PasswordPrompt` (same
  "Natalie, what's the magic word?" copy and prompt styling) in place of the
  picker step. On submit:
  - `checkAuth(basicHeader({ user: 'natalie', password }))` succeeds →
    `setCredentials(password)`, reveal the picker.
  - 401 → prompt error `Wrong password — try again` (existing copy).
  - 503 → prompt closes; inline flow error `Logging is disabled right now`
    (existing `.flow-error` styling inside the sheet).
  - Other errors → prompt error `Couldn't check the password — try again`.
  - Cancel → close the sheet.
- While the check is in flight the prompt's Save button is disabled (no
  double-submit).

After the first success the credentials are stored, so the gate never appears
again on that device. The save-time prompt/401 machinery in `useWriteAction`
is untouched and remains the backstop (stale stored password, plus
delete/photo/friend actions, which keep their save-time gates).

## Error handling

All gate failures are user-visible in place (prompt error or flow error line);
no silent paths. A stale *stored* password is out of the gate's scope by
design — it surfaces at save exactly as today (401 → clear credentials →
prompt with error, draft preserved).

## Testing

- **Server** (`app.test.ts` style): `/api/auth/check` matrix — 204 with valid
  credentials, 401 with wrong/missing, 503 when writes disabled.
- **Client `api.test.ts`** (append): `checkAuth` sends the header and GETs the
  right path; throws `ApiError` with status on 401/503.
- **Client `LogSightingFlow.test.tsx`** (append; existing tests set
  credentials in setup so they take the skip path unchanged): gate renders
  instead of picker with no stored credentials; verify-success stores
  credentials and reveals the picker; 401 shows the wrong-password copy and
  stays on the prompt; 503 shows `Logging is disabled right now`; cancel
  closes the sheet; stored-credentials open never touches fetch.

## Out of scope

Gating delete/photo/friend actions earlier · hiding the log button ·
rate-limiting the check endpoint · remembering "wrong password" across sheet
opens.

## Definition of done

- No saved password: tapping "+ Log a sighting" shows the magic-word prompt
  first; wrong password errors immediately; correct password opens the picker
  and is remembered.
- Saved password: picker opens instantly with no auth-check request.
- Blank `WRITE_USER`/`WRITE_PASSWORD` on the server: the prompt reports
  logging disabled before any critter is picked.
- Full suite, lint, typecheck green; CI green on the PR.
