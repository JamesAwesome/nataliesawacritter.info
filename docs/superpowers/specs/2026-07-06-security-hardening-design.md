# Security Hardening — Design

**Date:** 2026-07-06
**Status:** Approved (pending spec review)

## Purpose

Act on the security & privacy audit of nataliesawacritter.info. The classic-vuln
posture is already strong; this branch closes the real gaps. Per the owner's
decision, the app **stays publicly readable** (the fun public share + friend
RSS/push is preserved) — Natalie's safety is protected with the lightest touch:
a warning + server-side photo GPS stripping, not by gating reads or auto-coarsening
the `place` text.

## In scope

**Privacy / safety**
1. Location warning in the log form.
2. Server-side photo EXIF/GPS stripping (defense-in-depth).
3. Correlation-metadata trim (public API omits `createdAt`; random photo filenames).

**Technical hardening**
4. Security headers + CSP (`helmet`), `x-powered-by` off.
5. Rate limiting (write-auth, write verbs, push-subscribe).
6. Push SSRF allowlist.

## Out of scope (deferred / explicitly not doing)

Gating reads behind auth · auto-coarsening/removing the public `place` text ·
`sharp` / pixel re-encode · push-unsubscribe ownership proof · shorter photo
cache TTL. (First two are the owner's product choice to keep it public; the rest
are Low-severity, revisitable later.)

## Items

### 1. Location warning (client)

`src/components/DetailsForm.tsx` — under the "Where?" (`place`) field, a small
muted hint: sightings are public; don't enter a home address or exact current
location. Copy-only, no logic. A matching note near the photo control is optional.

### 2. Server-side EXIF/GPS strip

New dependency-free helper `server/sightings/stripJpeg.ts`:
`stripJpegExif(buf: Buffer): Buffer`.
- Validate the JPEG magic (`0xFFD8` SOI); throw a typed error if not a JPEG.
- Walk the JPEG marker segments and drop **APP1** segments (`0xFFE1`) — where EXIF
  *and* XMP live, i.e. all GPS/location metadata — copying everything else
  through. (The plan may also drop other `APPn` markers for completeness; APP1 is
  the required minimum.)
- Applied in `server/sightings/photoRoutes.ts` on `PUT …/photo`: run the raw body
  through `stripJpegExif` before writing to disk. A body that fails validation →
  400 (this also closes the "any bytes labeled image/jpeg" gap). The client's
  canvas re-encode stays as the first line of defense; this is the backstop for
  non-SPA uploads.

### 3. Correlation-metadata trim

- **Public API coarsening:** `GET /api/sightings` projects each row's `createdAt`
  to **minute precision** (seconds and milliseconds zeroed) before serializing,
  removing the sub-minute "active right now" signal and staying no finer than the
  sighting time that is already public. The client still receives a `createdAt`
  ISO string, so the recency ordering that depends on it — the leaderboard and
  "recently seen" (`insights.ts`) and the sort tiebreak (`useSightings`) — is
  unchanged. The store/DB and the RSS builder keep the full-precision `createdAt`
  internally. Add a small `toPublicSighting(row)` projection in the sightings GET
  route. (Chosen over omitting the field: omission would degrade leaderboard/recent
  recency ordering, which reads `createdAt`.)
- **Photo filename:** generate the stored filename from a random token
  (`crypto.randomUUID()`), not `Date.now()`, so the upload epoch isn't embedded in
  the public URL. Update the strict `PHOTO_FILENAME_RE` to the new token shape
  (still `.jpg`, still anchored/traversal-proof).

### 4. Security headers + CSP

Add `helmet` in `server/app.ts` with an explicit CSP tuned to this app (verified
against the running app — fonts, inline styles, and the service worker must load
with zero console violations):

    default-src 'self';
    script-src 'self';
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    font-src 'self' https://fonts.gstatic.com;
    img-src 'self' data:;
    connect-src 'self';
    manifest-src 'self';
    worker-src 'self';
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self';
    object-src 'none';

(`'unsafe-inline'` on `style-src` is required by React's inline `style` attributes
— e.g. LeaderboardList/tint backgrounds; `fonts.googleapis.com` is the Google
Fonts stylesheet, `fonts.gstatic.com` the font files.) Plus `Referrer-Policy:
strict-origin-when-cross-origin`, a `Permissions-Policy` denylist
(camera/microphone/geolocation off), HSTS, and `X-Content-Type-Options: nosniff`
globally. Call `app.disable('x-powered-by')`. Keep the existing per-route `nosniff`
on photos (harmless overlap).

### 5. Rate limiting

Add `express-rate-limit`:
- Auth/write endpoints (`/api/auth/check`, sightings/profiles/photo write verbs):
  a modest per-IP limit (e.g. ~10/min) → 429, to throttle `WRITE_PASSWORD`
  brute-force.
- `POST /api/push/subscriptions`: a tighter per-IP limit to bound spam DB growth.
- **Client IP:** the origin is reachable only via the Cloudflare tunnel, so
  `req.ip` is the tunnel peer for everyone. Key the limiter on the
  `CF-Connecting-IP` header (Cloudflare sets it; untrusted external clients can't
  reach the origin to spoof it). Set `app.set('trust proxy', …)` consistently.
  Document the assumption that the origin is tunnel-only.

### 6. Push SSRF allowlist

In the subscription validator (`server/push/routes.ts` / its parse helper), reject
an `endpoint` whose host is not a known push service. Use a **hostname allowlist**
(suffix match) of the major services — `fcm.googleapis.com`,
`updates.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com`
— rejecting anything else with 400. (Allowlist beats private-IP-range checks: it's
simpler and immune to DNS rebinding.) This prevents the server from being coerced
into POSTing to attacker-chosen internal hosts when a sighting is logged.

## Testing

- **`stripJpegExif`:** a minimal JPEG with a synthetic APP1/EXIF (GPS) segment →
  output has no APP1, still valid SOI, decodes; a non-JPEG buffer → throws; the PUT
  route returns 400 for a non-JPEG body.
- **Metadata trim:** the sightings GET response coarsens `createdAt` to the minute
  (seconds/ms zeroed); the stored filename matches the random-token pattern, not an
  epoch.
- **SSRF allowlist:** an FCM/Mozilla/Windows/Apple endpoint is accepted; an
  arbitrary/private-host endpoint → 400.
- **Rate limiting:** exceeding the limit returns 429 (integration or a unit test
  with a low limit).
- **CSP / headers:** real-browser load (headless Chrome) shows the app functioning
  with zero CSP console violations and fonts/SW loaded; a response-header check
  confirms CSP, HSTS, Referrer-Policy, Permissions-Policy, nosniff present and
  `x-powered-by` absent. (Definition-of-Done check.)
- Update existing tests affected by the `createdAt` removal and the new filename
  shape.

## Definition of done

- Live responses carry the security headers (CSP, HSTS, X-Frame via
  `frame-ancestors`, Referrer-Policy, Permissions-Policy, nosniff); `x-powered-by`
  is gone.
- Write-auth and push-subscribe are rate-limited; push rejects non-allowlisted
  endpoints; uploaded photos carry no GPS; the public API omits `createdAt`; the
  place field shows the public-safety warning.
- Full suite + lint + typecheck + build green; CI green; CSP verified in a real
  browser.
