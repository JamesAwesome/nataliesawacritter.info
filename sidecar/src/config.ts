export type SidecarConfig = {
  appBaseUrl: string
  authHeader: string
  repoDir: string
  model: string
  pollIntervalMs: number
  dryRun: boolean
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
  }
}
