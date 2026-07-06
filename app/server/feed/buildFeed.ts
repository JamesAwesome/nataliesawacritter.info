import type { Sighting } from '../sightings/store.js'

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

function titleFor(s: Sighting): string {
  return s.name === null
    ? `${s.emoji} Natalie saw a critter`
    : `${s.emoji} Natalie saw ${s.name}`
}

/** Description HTML (user text escaped even inside CDATA so it renders as text,
 *  never markup); empty string when there is nothing to show. */
function descriptionHtml(s: Sighting, siteUrl: string): string {
  const lines: string[] = []
  if (s.place !== null && s.place !== '') lines.push(`<p>📍 ${xmlEscape(s.place)}</p>`)
  if (s.sightedTime !== null && s.sightedTime !== '') lines.push(`<p>🕐 ${xmlEscape(s.sightedTime)}</p>`)
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
