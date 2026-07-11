import { execFile } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { matteEmoji, type Exec } from '../matte'

const pexec = promisify(execFile)
const exec: Exec = async (cmd, args, o) => {
  try {
    const { stdout, stderr } = await pexec(cmd, args, { cwd: o.cwd, maxBuffer: 32 * 1024 * 1024 })
    return { code: 0, stdout, stderr }
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string }
    return { code: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '', stderr: e.stderr ?? String(err) }
  }
}

const [inPath, slug, label] = process.argv.slice(2)
if (!inPath || !slug || !label) {
  console.error('usage: matte-emoji <inPath> <slug> "<label>"')
  process.exit(2)
}
try {
  const { svgPath, sourcePath } = await matteEmoji({ inPath, slug, label, exec, readFile, writeFile, mkdir, copyFile })
  console.log(`${svgPath}\n${sourcePath}`)
} catch (err) {
  console.error(`matte-emoji: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
