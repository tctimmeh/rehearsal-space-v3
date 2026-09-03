import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { ExternalTool } from '../../shared/tools'

const run = promisify(execFile)

/** Long enough for a cold start — a bundled demucs takes over a second. */
const PROBE_TIMEOUT_MS = 15000

interface Probe {
  args: string[]
  /** Some tools have no version flag at all; the run only proves they work. */
  readsVersion: boolean
}

/**
 * Not every tool spells it the same way, and getting it wrong looks exactly
 * like the tool being broken: ffmpeg exits non-zero on `--version`, and demucs
 * has no version flag, answering `--help` with a usage block.
 */
const PROBES: Record<ExternalTool, Probe> = {
  ffmpeg: { args: ['-version'], readsVersion: true },
  ffprobe: { args: ['-version'], readsVersion: true },
  'yt-dlp': { args: ['--version'], readsVersion: true },
  demucs: { args: ['--help'], readsVersion: false }
}

/** What the tool calls itself, or null when it will not say. */
export async function askVersion(tool: ExternalTool, path: string): Promise<string | null> {
  const probe = PROBES[tool]
  if (!probe.readsVersion) return null
  try {
    const { stdout, stderr } = await run(path, probe.args, { timeout: PROBE_TIMEOUT_MS })
    /* ffmpeg follows its version with a copyright line's worth of noise. */
    const firstLine = `${stdout}${stderr}`.split('\n')[0]?.split(' Copyright')[0]?.trim()
    return firstLine === undefined || firstLine === '' ? null : firstLine
  } catch {
    /* Present but uncooperative is still present. */
    return null
  }
}

/**
 * Whether the program at this path is the tool, working.
 *
 * A download cut off part way through leaves a file that is the right size to
 * look plausible and the wrong shape to run, so a fetched copy is asked to do
 * something before it is kept.
 */
export async function answersAsTool(tool: ExternalTool, path: string): Promise<boolean> {
  try {
    await run(path, PROBES[tool].args, { timeout: PROBE_TIMEOUT_MS })
    return true
  } catch {
    return false
  }
}
