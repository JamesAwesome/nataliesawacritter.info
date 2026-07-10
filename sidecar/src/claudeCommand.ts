/** Argv for a headless `claude -p` run. `--output-format json` puts the final
 *  message in `.result`; no `--bare`, so the project skill in `.claude/skills/`
 *  auto-loads. `--dangerously-skip-permissions` gives full autonomy — safe only
 *  because the run is boxed in a throwaway worktree with a scoped GH token and
 *  no merge rights. */
export function buildClaudeArgs(task: string, opts: { model: string; maxTurns: number }): string[] {
  return [
    '-p',
    task,
    '--model',
    opts.model,
    '--output-format',
    'json',
    '--dangerously-skip-permissions',
    '--max-turns',
    String(opts.maxTurns),
  ]
}
