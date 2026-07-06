import { describe, expect, it } from 'vitest'
import type { Sighting } from '../sightings/store.js'
import { buildFeed } from './buildFeed.js'

const SITE = 'https://example.test'

function sighting(overrides: Partial<Sighting> = {}): Sighting {
  return {
    id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa',
    emoji: '🦊',
    name: 'Mr Fox',
    sightedOn: '2026-07-05',
    sightedTime: null,
    place: null,
    comment: null,
    photoPath: null,
    createdAt: new Date('2026-07-05T12:00:00Z'),
    ...overrides,
  }
}

/** Every `&` must begin a valid XML entity — a naked `&` is the classic way
 *  bad escaping produces malformed XML. This is a parser-free well-formedness
 *  guard suited to the server's DOM-free test environment. */
function hasNakedAmpersand(xml: string): boolean {
  return /&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(xml)
}

function itemCount(xml: string): number {
  return (xml.match(/<item>/g) ?? []).length
}

describe('buildFeed', () => {
  it('produces RSS 2.0 with channel metadata and the atom self link', () => {
    const xml = buildFeed([sighting()], SITE)
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">')
    expect(xml).toContain('<title>🐾 Natalie Saw a Critter!</title>')
    expect(xml).toContain(`<link>${SITE}</link>`)
    expect(xml).toContain(`<atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />`)
    expect(hasNakedAmpersand(xml)).toBe(false)
  })

  it('emits one item per sighting with a named title, guid, and pubDate', () => {
    const xml = buildFeed([sighting()], SITE)
    expect(itemCount(xml)).toBe(1)
    expect(xml).toContain('<title>🦊 Natalie saw a Mr Fox — July 5, 2026</title>')
    expect(xml).toContain('<guid isPermaLink="false">3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa</guid>')
    expect(xml).toContain('<pubDate>Sun, 05 Jul 2026 12:00:00 GMT</pubDate>')
  })

  it('falls back to "a critter" when unnamed', () => {
    const xml = buildFeed([sighting({ name: null })], SITE)
    expect(xml).toContain('<title>🦊 Natalie saw a critter — July 5, 2026</title>')
  })

  it('escapes XML-special characters in names so the feed stays well-formed', () => {
    const xml = buildFeed([sighting({ name: 'Tom & <Jerry>' })], SITE)
    expect(xml).toContain('<title>🦊 Natalie saw a Tom &amp; &lt;Jerry&gt; — July 5, 2026</title>')
    expect(xml).not.toContain('Tom & <Jerry>')
    expect(hasNakedAmpersand(xml)).toBe(false)
  })

  it('prepends "a" before a consonant name and "an" before a vowel name', () => {
    expect(buildFeed([sighting({ emoji: '🐦', name: 'Cardinal' })], SITE)).toContain(
      '<title>🐦 Natalie saw a Cardinal — July 5, 2026</title>',
    )
    expect(buildFeed([sighting({ emoji: '🦉', name: 'Owl' })], SITE)).toContain(
      '<title>🦉 Natalie saw an Owl — July 5, 2026</title>',
    )
    expect(buildFeed([sighting({ name: 'Fox' })], SITE)).toContain(
      '<title>🦊 Natalie saw a Fox — July 5, 2026</title>',
    )
  })

  it('appends the time after the date in the title when a time is present', () => {
    const xml = buildFeed([sighting({ sightedTime: 'dawn' })], SITE)
    expect(xml).toContain('<title>🦊 Natalie saw a Mr Fox — July 5, 2026 · dawn</title>')
  })

  it('includes an absolute enclosure and inline img when a photo is present', () => {
    const xml = buildFeed([sighting({ photoPath: '/api/photos/abc-1.jpg' })], SITE)
    expect(xml).toContain(`<enclosure url="${SITE}/api/photos/abc-1.jpg" type="image/jpeg" length="0" />`)
    expect(xml).toContain(`<img src="${SITE}/api/photos/abc-1.jpg" alt="" />`)
    expect(hasNakedAmpersand(xml)).toBe(false)
  })

  it('always shows the sighting date in the description', () => {
    const xml = buildFeed([sighting({ sightedOn: '2026-07-05' })], SITE)
    expect(xml).toContain('<p>📅 July 5, 2026</p>')
  })

  it('combines the date and time on one line when a time is present', () => {
    const xml = buildFeed([sighting({ sightedOn: '2026-07-05', sightedTime: 'dawn' })], SITE)
    expect(xml).toContain('<p>📅 July 5, 2026 · dawn</p>')
  })

  it('a bare sighting still gets a description carrying just the date line', () => {
    const xml = buildFeed([sighting()], SITE)
    expect(xml).not.toContain('<enclosure')
    expect(xml).toContain('<description><![CDATA[')
    expect(xml).toContain('<p>📅 July 5, 2026</p>')
    expect(xml).not.toContain('📍') // no place line
    expect(xml).not.toContain('<img') // no photo
  })

  it('renders place, time, and comment (escaped) in the description', () => {
    const xml = buildFeed(
      [sighting({ place: 'the "garden"', sightedTime: 'dawn', comment: 'a & b' })],
      SITE,
    )
    expect(xml).toContain('<description><![CDATA[')
    expect(xml).toContain('the &quot;garden&quot;')
    expect(xml).toContain('📅 July 5, 2026 · dawn')
    expect(xml).toContain('a &amp; b')
    expect(hasNakedAmpersand(xml)).toBe(false)
  })

  it('escapes a literal ]]> in user text so it cannot close the CDATA early', () => {
    const xml = buildFeed([sighting({ comment: 'oops ]]> hi' })], SITE)
    // The `>` is XML-escaped before CDATA-wrapping, so the raw ]]> can't appear
    // in the comment and break out of the CDATA section.
    expect(xml).toContain('oops ]]&gt; hi')
    expect(xml).not.toContain('oops ]]> hi')
    expect(hasNakedAmpersand(xml)).toBe(false)
  })

  it('produces a valid empty channel with no items and no lastBuildDate', () => {
    const xml = buildFeed([], SITE)
    expect(itemCount(xml)).toBe(0)
    expect(xml).toContain('<channel>')
    expect(xml).not.toContain('<lastBuildDate>')
    expect(hasNakedAmpersand(xml)).toBe(false)
  })
})
