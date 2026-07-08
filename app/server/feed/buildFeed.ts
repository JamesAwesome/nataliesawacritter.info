import type { Sighting } from '../sightings/store.js'
import { standInFor } from '../customEmoji.js'
import { quantityTextSuffix } from '../quantity.js'

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Wrap HTML in CDATA, splitting any literal ]]> so it can't close early. */
function cdata(html: string): string {
  return `<![CDATA[${html.split(']]>').join(']]]]><![CDATA[>')}]]>`
}

/** RFC-822 date from a YYYY-MM-DD, fixed at noon UTC to avoid any date shift. */
function rfc822(sightedOn: string): string {
  return new Date(`${sightedOn}T12:00:00Z`).toUTCString()
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "2026-07-05" → "July 5, 2026". Parses the string directly — no Date, no timezone. */
function formatDate(sightedOn: string): string {
  const [year, month, day] = sightedOn.split('-')
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`
}

function articleFor(name: string): string {
  return /^[aeiou]/i.test(name) ? 'an' : 'a'
}

const CLOCK_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** '15:08' → '3:08 PM' for the feed; free-text ('dawn') passes through. Mirrors
 *  the client's formatClockTime — the two can't share a module. */
function formatClock(value: string): string {
  const m = CLOCK_RE.exec(value)
  if (m === null) return value
  const hour24 = Number(m[1])
  const suffix = hour24 < 12 ? 'AM' : 'PM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${m[2]} ${suffix}`
}

function whenSuffix(s: Sighting): string {
  const date = formatDate(s.sightedOn)
  return s.sightedTime !== null && s.sightedTime !== ''
    ? `${date} · ${formatClock(s.sightedTime)}`
    : date
}

function titleFor(s: Sighting): string {
  const glyph = standInFor(s.emoji)
  const qty = quantityTextSuffix(s.quantity)
  // With a count the article reads wrong ("a Deer ×2"), so drop it and append
  // the badge; the single-critter default keeps the natural "a/an <name>".
  const base =
    s.name === null
      ? `${glyph} Natalie saw a critter${qty}`
      : qty === ''
        ? `${glyph} Natalie saw ${articleFor(s.name)} ${s.name}`
        : `${glyph} Natalie saw ${s.name}${qty}`
  return `${base} — ${whenSuffix(s)}`
}

/** Description HTML (user text escaped even inside CDATA so it renders as text,
 *  never markup); always includes the date line. */
function descriptionHtml(s: Sighting, siteUrl: string): string {
  const lines: string[] = []
  if (s.place !== null && s.place !== '') lines.push(`<p>📍 ${xmlEscape(s.place)}</p>`)
  const when =
    s.sightedTime !== null && s.sightedTime !== ''
      ? `${formatDate(s.sightedOn)} · ${xmlEscape(formatClock(s.sightedTime))}`
      : formatDate(s.sightedOn)
  lines.push(`<p>📅 ${when}</p>`)
  if (s.comment !== null && s.comment !== '') lines.push(`<p>${xmlEscape(s.comment)}</p>`)
  if (s.photoPath !== null) lines.push(`<img src="${xmlEscape(siteUrl + s.photoPath)}" alt="" />`)
  return lines.join('\n')
}

function itemXml(s: Sighting, siteUrl: string): string {
  const desc = descriptionHtml(s, siteUrl)
  const description = desc === '' ? '' : `\n    <description>${cdata(desc)}</description>`
  const enclosure =
    s.photoPath === null
      ? ''
      : `\n    <enclosure url="${xmlEscape(siteUrl + s.photoPath)}" type="image/jpeg" length="0" />`
  return `  <item>
    <title>${xmlEscape(titleFor(s))}</title>
    <link>${xmlEscape(siteUrl)}</link>
    <guid isPermaLink="false">${s.id}</guid>
    <pubDate>${rfc822(s.sightedOn)}</pubDate>${description}${enclosure}
  </item>`
}

export function buildFeed(sightings: Sighting[], siteUrl: string): string {
  const items = sightings.map((s) => itemXml(s, siteUrl)).join('\n')
  const lastBuild =
    sightings.length > 0
      ? `\n    <lastBuildDate>${rfc822(sightings[0].sightedOn)}</lastBuildDate>`
      : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>🐾 Natalie Saw a Critter!</title>
    <link>${xmlEscape(siteUrl)}</link>
    <description>Live-ish updates on the critters Natalie sees.</description>
    <language>en-us</language>
    <atom:link href="${xmlEscape(siteUrl + '/feed.xml')}" rel="self" type="application/rss+xml" />${lastBuild}
${items}
  </channel>
</rss>
`
}
