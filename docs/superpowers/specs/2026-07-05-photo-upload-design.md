# Photo Upload Cycle — Design Spec

**Date:** 2026-07-05
**Status:** Approved
**Depends on:** all prior cycles (through logging + profiles, PR #9 / 7ae02f1)
**This is the last feature from the design handoff** (docs/design/README.md §5 photo
toggle, §7 Sighting Detail photo block, Assets note "swap for the real photo <img>").

## Purpose

Natalie attaches a photo while logging a sighting, sees it in Sighting Detail, and
can add/replace/remove photos on any sighting afterwards. Photos are downscaled on
her device (small, fast, EXIF/GPS-free) and stored on the existing `photos` volume.

## Decisions (alternatives considered)

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Attach scope | Log flow + add/replace/remove from Sighting Detail | Log-only (handoff-minimal, but "forgot the photo" needs a recovery path anyway for best-effort upload); management-everywhere beyond Detail (YAGNI) |
| Processing | Client-side canvas re-encode → JPEG, long edge ≤1600px, quality 0.85, ALWAYS re-encode | Server-side sharp (native dep, HEIC patent gap, full-size uploads); store originals (multi-MB serves, public EXIF/GPS leak through the tunnel) |
| Upload shape | Per-sighting endpoints `PUT/DELETE /api/sightings/:id/photo`, raw JPEG body | Standalone photo pool (orphan cleanup story); multipart sighting POST (reworks the validated JSON endpoint; Detail needs endpoints anyway) |
| Upload failure in log flow | Best-effort after the sighting saves (friend-save pattern); silent, Detail add is the recovery | Blocking (couples logging to photo availability); retry queue (YAGNI) |
| File naming | `<sightingId>-<epochMillis>.jpg` in PHOTOS_DIR | UUID pool names (orphans possible); `<id>.jpg` fixed (stale caches on replace) |
| Server body parsing | `express.raw({ type: 'image/jpeg', limit: '6mb' })` — no new dependency | multer/busboy multipart (dependency for a single processed blob) |

## Cycle opener (debt batch — lands first, each with tests)

1. **`useWriteAction` per-run messages.** `run(action, onSuccess, messages?)` accepts
   `{ disabled, failed }`, falling back to the hook-level defaults. Components then
   need ONE instance regardless of how many write actions they host: SightingDetail
   collapses `write`+`friendWrite` (delete / friend / soon photo) into one instance —
   one busy flag, one prompt, one error line; the pairwise disabled={other.busy ||
   other.prompt.open} cross-wiring is deleted (single instance serializes naturally).
   LogSightingFlow's `write`+`removeWrite` collapse identically. Existing per-instance
   message config keeps working (defaults).
2. **Server `httpValidation.ts`**: shared `UUID_RE`, `sendValidation(res, details)`,
   and `rejectUnknownFields(record, known, details)`; sightings + profiles routers
   consume it (photo routes become the third consumer).
3. **Migration 0002**: unique index `critter_profiles_emoji_norm_name_idx` on
   `(emoji, lower(trim(name)))` replacing the exact-string unique index (drop old,
   create new; custom SQL migration — drizzle-kit can't express it). Store's 23505
   mapping unchanged. Pre-existing case-variant rows would break the index build:
   acceptable, dev DBs only (main stack DB has no duplicates; verify in e2e).
4. **`makeProfile()`** fixture in `test/helpers.tsx`; MR_FOX literals in
   EmojiPicker/LogSightingFlow.friends/App tests migrate to it.
5. **`.flow-error` disambiguation**: the three consumers (App fetch banner, flow save
   error, Detail action error) each get a `data-testid` (`app-error`, `flow-error`,
   `detail-error`); class/styling unchanged.

Still deferred (unchanged): sheet-state self-healing, delete-button rest color,
leaderboard string< tiebreak, bar-width float, EmojiPicker tile sub-component,
isUniqueViolation cycle guard, useResource/api-factory extractions.

## Client image pipeline — `app/src/lib/photo.ts`

```ts
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number }
// Proportional downscale so max(width,height) ≤ maxEdge; never upscales; rounds to integers; min 1px.

export async function downscalePhoto(file: File | Blob): Promise<Blob>
// createImageBitmap(file) → canvas at fitWithin(…, 1600) → toBlob('image/jpeg', 0.85).
// ALWAYS re-encodes (even small images): the re-encode is what strips EXIF/GPS.
// Rejects (with the original error) if the browser can't decode the file.
```

`fitWithin` is pure and unit-tested. `downscalePhoto` stays thin; component tests
mock it (jsdom has no real canvas). iPhone HEIC decodes in Safari's own
`createImageBitmap`; a browser that can't decode a given file surfaces the inline
error below.

## Server

**Store** (`app/server/sightings/store.ts` additions):
- `getById(id): Promise<Sighting | null>`
- `setPhotoPath(id, photoPath: string | null): Promise<Sighting | null>` — returns
  the UPDATED row, null if the id doesn't exist. Callers capture the previous path
  from `getById` first (single-user app; no transactional race worth guarding).

**Routes** (`app/server/sightings/photoRoutes.ts` exports two routers: the
PUT/DELETE pair merges into the sightings router mount, and the public GET router
mounts at `/api/photos` in app.ts; `PHOTOS_DIR` injected via createApp deps
`photosDir: string`):
- `PUT /api/sightings/:id/photo` — writeGate. `express.raw({ type: 'image/jpeg', limit: '6mb' })`
  scoped to this route. 400 `{error:'validation',details:{id|photo}}` for non-uuid id,
  wrong/missing content-type, or empty body; 413 (Express raw-limit) passes through the
  errorHandler as `{error:'payload too large'}` (errorHandler gains the `413`/
  `entity.too.large` mapping); 404 unknown id. Success: write
  `<id>-<Date.now()>.jpg`, `setPhotoPath`, then best-effort `fs.rm` the previous
  file. 200 → the updated sighting JSON.
- `DELETE /api/sightings/:id/photo` — writeGate. Clears `photo_path`, best-effort
  removes the file. 204 even when there was no photo (idempotent); 404 unknown id;
  400 non-uuid.
- `GET /api/photos/:filename` — public. Filename must match
  `/^[0-9a-f-]{36}-\d+\.jpg$/` (400 otherwise — also forecloses traversal);
  `res.sendFile` from PHOTOS_DIR with `Cache-Control: public, max-age=31536000, immutable`
  (names are version-unique); 404 if missing.
- **Sighting DELETE** (existing route): after a successful row delete, best-effort
  remove its photo file (route fetches the row first via `getById`).

Client `photoPath` values are the API-relative URL (`/api/photos/<filename>`) so the
existing `photoPath` field is directly usable as `<img src>`. The DB stores just the
filename; the store maps to/from the URL form at the row boundary (single mapping
point in the store's row conversion).

## Client UI

**`PhotoControl`** (new `app/src/components/PhotoControl.tsx`, shared by DetailsForm
and SightingDetail): dashed "📷 Add a photo" button (handoff colors `#9DB6E8`/`#5F80C7`
as CSS vars) wrapping a hidden `<input type="file" accept="image/*">`. On pick:
`downscalePhoto` → `onPhoto(blob)`; while encoding, the button shows "Preparing…" and
disables; decode failure → inline `Couldn't read that photo` under the button, state
otherwise unchanged. "Added" state (green `#5FBFA6`/`#3E9C81`/`#EFFAF3` per handoff):
"✓ Photo added" plus a small ✕ (aria-label "Remove photo") calling `onPhoto(null)`.

**DetailsForm**: hosts PhotoControl above the save-as-friend slot; the picked blob
joins the draft state; `onSave` opts gain `photo: Blob | null`.

**LogSightingFlow**: `onSave` (App's `addSighting`) now RETURNS the created
`Sighting`; new prop `onUploadPhoto(id, blob, authHeader): Promise<void>`. In
`write.run`: save sighting → if photo, `try { await onUploadPhoto(created.id, blob, header) } catch { /* best-effort; Detail add is the recovery */ }`
(exactly the friend-save pattern, same action, same auth).

**SightingDetail**: photo present → `<img className="detail-photo" src={sighting.photoPath} alt="" loading="lazy">`
(rounded 14px, max-height 260px, object-fit cover) with two quiet actions beneath:
"Replace photo" (opens the same picker → downscale → PUT) and "Remove photo"
(two-tap "Really remove?" grammar → DELETE). No photo → PhotoControl in add mode →
PUT on pick (immediate, not deferred — Detail has no Save button). All three run via
the component's single write action with messages
`{ disabled: 'Photos are disabled right now', failed: "Couldn't update the photo — try again" }`.
After success the sighting list refreshes via a new `useSightings.applySighting(updated)`
(replaces the row in place from the PUT/DELETE response; DELETE returns 204 so the
client clears `photoPath` locally).

**api.ts**: `uploadPhoto(id, blob, authHeader): Promise<Sighting>` (PUT, body blob,
content-type image/jpeg) and `deletePhoto(id, authHeader): Promise<void>`.

No photo indicators in History/calendar/day rows (not in the handoff).

## Error handling

- Log-flow upload failure: silent (sighting is logged, toast shows); Detail is the
  visible recovery path.
- Detail photo actions: standard write-action mapping (401 prompt / 503 / generic)
  with photo-flavored copy.
- Oversized body (413) and undecodable picks are user-visible inline messages.
- GET photo 404 (file pruned but column set — only possible via manual volume edits):
  the `<img>` renders broken; no special handling (YAGNI).

## Testing

- **Unit**: `fitWithin` matrix (landscape/portrait/square, never-upscale, rounding,
  1px floor); filename regex accept/reject (traversal attempts, wrong extension).
- **Server routes** (fake store + `fs.mkdtemp` dir): auth gate on PUT/DELETE; 400s
  (non-uuid, wrong content-type, empty body); 404 unknown id; PUT writes the file +
  calls setPhotoPath + deletes the previous file; DELETE idempotent; GET serves with
  immutable cache header, 400 on traversal, 404 on missing; 413 mapping.
- **Integration** (Testcontainers + temp dir): full lifecycle PUT→GET→replace (old
  file gone)→DELETE (file gone, column null); sighting DELETE removes the file.
- **Client**: PhotoControl states (add→preparing→added→clear, decode-failure message)
  with `downscalePhoto` mocked; flow best-effort upload (called with created id +
  header; failure doesn't block toast); Detail add-immediate / replace / two-tap
  remove incl. prompt path; `applySighting` row replacement.
- **Opener items** each carry their own tests (per-run messages incl. collapsed
  single-instance SightingDetail; httpValidation consumers; 0002 index conflict on
  case-variant insert via Testcontainers; makeProfile adoption compiles the suites;
  data-testids asserted where the ambiguity existed).
- Full suite green; CI green.

## Out of scope

Photo galleries/multiple photos per sighting · client-side crop/rotate UI · photo
indicators in list rows · CDN/thumbnail variants · EXIF preservation options.

## Definition of done

- Phone flow: log a sighting with a photo → "✓ Photo added" → save → Sighting Detail
  shows the image; the served file is a downscaled JPEG (≤1600px, no EXIF).
- From Detail: add a photo to an old sighting; replace it (old file disappears from
  the volume); two-tap remove it (file gone, block gone).
- curl lifecycle against the compose stack matches (PUT raw JPEG → GET immutable →
  replace → DELETE), and deleting a sighting removes its file from the volume.
- 0002 index rejects `('🦊','mr fox')` when `('🦊','Mr Fox')` exists (409 end-to-end).
- Full suite, lint, typecheck, build green; CI green on the PR.
