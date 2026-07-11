export type SidecarConfig = {
  appBaseUrl: string
  authHeader: string
  repoDir: string
  model: string
  pollIntervalMs: number
  dryRun: boolean
  /** GitHub logins allowed to trigger `/iterate` on a sidecar PR. Empty ==
   *  comment-iteration disabled (deny by default). */
  allowedCommenters: string[]
  /** Gemini image API key ("nano banana"). Absent → the sidecar hand-draws. */
  geminiApiKey?: string
  /** Max agent turns per run. The emoji job is multi-step (generate → vision →
   *  matte → wire → test → PR); 40 hit error_max_turns, so default higher. */
  maxTurns: number
  /** ntfy topic URL for a "PR opened" push (reuse the app's NTFY_URL). Absent → off. */
  ntfyUrl?: string
}

/** Secrets consumed by child processes (claude, gh) — required so the sidecar
 *  refuses to start half-configured (deny by default). */
const REQUIRED = ['ANTHROPIC_API_KEY', 'GH_TOKEN', 'APP_BASE_URL', 'WRITE_USER', 'WRITE_PASSWORD', 'REPO_DIR'] as const

export function parseConfig(env: Record<string, string | undefined>): SidecarConfig {
  const missing = REQUIRED.filter((k) => (env[k] ?? '') === '')
  if (missing.length > 0) {
    throw new Error(`sidecar not configured — missing env: ${missing.join(', ')}`)
  }
  const authHeader = 'Basic ' + Buffer.from(`${env.WRITE_USER}:${env.WRITE_PASSWORD}`).toString('base64')
  return {
    appBaseUrl: env.APP_BASE_URL!.replace(/\/+$/, ''),
    authHeader,
    repoDir: env.REPO_DIR!,
    model: env.SIDECAR_MODEL ?? 'sonnet',
    pollIntervalMs: Number(env.POLL_INTERVAL_MS) || 60_000,
    dryRun: env.SIDECAR_DRY_RUN === '1' || env.SIDECAR_DRY_RUN === 'true',
    allowedCommenters: (env.SIDECAR_ALLOWED_COMMENTERS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== ''),
    geminiApiKey: (env.GEMINI_API_KEY ?? '') === '' ? undefined : env.GEMINI_API_KEY,
    maxTurns: Number(env.SIDECAR_MAX_TURNS) || 80,
    ntfyUrl: (env.NTFY_URL ?? '') === '' ? undefined : env.NTFY_URL,
  }
}
