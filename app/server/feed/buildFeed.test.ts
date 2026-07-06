import { JSDOM } from 'jsdom'
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

/** Parse as XML; returns the document (a <parsererror> node means malformed). */
function parse(xml: string): Document {
  return new JSDOM(xml, { contentType: 'application/xml' }).window.document
}

describe('buildFeed', () => {
  it('produces well-formed RSS with channel metadata and the atom self link', () => {
    const doc = parse(buildFeed([sighting()], SITE))
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.querySelector('rss')?.getAttribute('version')).toBe('2.0')
    expect(doc.querySelector('channel > title')?.textContent).toBe('🐾 Natalie Saw a Critter!')
    expect(doc.querySelector('channel > link')?.textContent).toBe(SITE)
    // atom:link self (namespaced — assert via the raw string to avoid NS querying)
    expect(buildFeed([sighting()], SITE)).toContain(`href="${SITE}/feed.xml"`)
  })

  it('emits one item per sighting with a named title, guid, and pubDate', () => {
    const doc = parse(buildFeed([sighting()], SITE))
    expect(doc.querySelectorAll('item')).toHaveLength(1)
    expect(doc.querySelector('item > title')?.textContent).toBe('🦊 Natalie saw Mr Fox')
    const guid = doc.querySelector('item > guid')
    expect(guid?.textContent).toBe('3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa')
    expect(guid?.getAttribute('isPermaLink')).toBe('false')
    expect(doc.querySelector('item > pubDate')?.textContent).toBe('Sun, 05 Jul 2026 12:00:00 GMT')
  })

  it('falls back to "a critter" when unnamed', () => {
    const doc = parse(buildFeed([sighting({ name: null })], SITE))
    expect(doc.querySelector('item > title')?.textContent).toBe('🦊 Natalie saw a critter')
  })

  it('escapes XML-special characters in names so the feed stays well-formed', () => {
    const doc = parse(buildFeed([sighting({ name: 'Tom & <Jerry>' })], SITE))
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.querySelector('item > title')?.textContent).toBe('🦊 Natalie saw Tom & <Jerry>')
  })

  it('includes an absolute enclosure and inline img when a photo is present', () => {
    const xml = buildFeed([sighting({ photoPath: '/api/photos/abc-1.jpg' })], SITE)
    const doc = parse(xml)
    const enclosure = doc.querySelector('item > enclosure')
    expect(enclosure?.getAttribute('url')).toBe(`${SITE}/api/photos/abc-1.jpg`)
    expect(enclosure?.getAttribute('type')).toBe('image/jpeg')
    // description is CDATA HTML; assert the inline img via the raw string
    expect(xml).toContain(`<img src="${SITE}/api/photos/abc-1.jpg"`)
  })

  it('has no enclosure or description when there is no photo, place, comment, or time', () => {
    const doc = parse(buildFeed([sighting()], SITE))
    expect(doc.querySelector('item > enclosure')).toBeNull()
    expect(doc.querySelector('item > description')).toBeNull()
  })

  it('renders place, time, and comment (escaped) in the description', () => {
    const xml = buildFeed(
      [sighting({ place: 'the "garden"', sightedTime: 'dawn', comment: 'a & b' })],
      SITE,
    )
    expect(parse(xml).querySelector('parsererror')).toBeNull()
    expect(xml).toContain('the &quot;garden&quot;')
    expect(xml).toContain('dawn')
    expect(xml).toContain('a &amp; b')
  })

  it('produces a valid empty channel with no items and no lastBuildDate', () => {
    const doc = parse(buildFeed([], SITE))
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.querySelectorAll('item')).toHaveLength(0)
    expect(doc.querySelector('lastBuildDate')).toBeNull()
  })
})
