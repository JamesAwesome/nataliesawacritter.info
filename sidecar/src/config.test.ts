import { describe, expect, it } from 'vitest'
import { parseConfig } from './config'

const full = {
  ANTHROPIC_API_KEY: 'sk-x',
  GH_TOKEN: 'ghp-x',
  APP_BASE_URL: 'http://app:8080/',
  WRITE_USER: 'natalie',
  WRITE_PASSWORD: 'sekrit',
  REPO_DIR: '/repo',
}

describe('parseConfig', () => {
  it('builds config from a full env, with defaults', () => {
    const c = parseConfig(full)
    expect(c.appBaseUrl).toBe('http://app:8080') // trailing slash trimmed
    expect(c.authHeader).toBe('Basic ' + Buffer.from('natalie:sekrit').toString('base64'))
    expect(c.repoDir).toBe('/repo')
    expect(c.model).toBe('sonnet')
    expect(c.pollIntervalMs).toBe(60_000)
    expect(c.dryRun).toBe(false)
  })

  it('applies overrides', () => {
    const c = parseConfig({ ...full, SIDECAR_MODEL: 'opus', POLL_INTERVAL_MS: '5000', SIDECAR_DRY_RUN: '1' })
    expect(c.model).toBe('opus')
    expect(c.pollIntervalMs).toBe(5000)
    expect(c.dryRun).toBe(true)
  })

  it('defaults maxTurns to 80 and honors SIDECAR_MAX_TURNS', () => {
    expect(parseConfig(full).maxTurns).toBe(80)
    expect(parseConfig({ ...full, SIDECAR_MAX_TURNS: '120' }).maxTurns).toBe(120)
  })

  it('defaults allowedCommenters to empty (comment-iteration off)', () => {
    expect(parseConfig(full).allowedCommenters).toEqual([])
  })

  it('reads NTFY_URL when present, undefined when absent', () => {
    expect(parseConfig({ ...full, NTFY_URL: 'https://ntfy.sh/t' }).ntfyUrl).toBe('https://ntfy.sh/t')
    expect(parseConfig(full).ntfyUrl).toBeUndefined()
  })

  it('parses SIDECAR_ALLOWED_COMMENTERS into trimmed, non-empty logins', () => {
    const c = parseConfig({ ...full, SIDECAR_ALLOWED_COMMENTERS: ' JamesAwesome , natalie ,, ' })
    expect(c.allowedCommenters).toEqual(['JamesAwesome', 'natalie'])
  })

  it('throws (deny by default) when a required key is missing, naming it', () => {
    const { GH_TOKEN: _omit, ...rest } = full
    expect(() => parseConfig(rest)).toThrow(/GH_TOKEN/)
  })

  it('treats a blank required value as missing', () => {
    expect(() => parseConfig({ ...full, ANTHROPIC_API_KEY: '' })).toThrow(/ANTHROPIC_API_KEY/)
  })

  it('reads GEMINI_API_KEY when present', () => {
    expect(parseConfig({ ...full, GEMINI_API_KEY: 'g-123' }).geminiApiKey).toBe('g-123')
  })

  it('leaves geminiApiKey undefined when absent or blank (fallback mode)', () => {
    expect(parseConfig(full).geminiApiKey).toBeUndefined()
    expect(parseConfig({ ...full, GEMINI_API_KEY: '' }).geminiApiKey).toBeUndefined()
  })
})
