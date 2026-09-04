import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { ProvidedTool } from '../../shared/tools'

const run = promisify(execFile)

/** Long enough for a cold start — a bundled demucs takes over a second. */
const PROBE_TIMEOUT_MS = 15000
/**
 * Longer, for the first time a fetched copy is asked to run.
 *
 * Several of these are one-file Python builds that unpack themselves to a
 * temporary directory before they do anything, and a machine may want to look
 * over a program it has never seen before that. Neither is a reason to throw
 * away a good copy.
 */
const FIRST_RUN_TIMEOUT_MS = 90000

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
const PROBES: Record<ProvidedTool, Probe> = {
  ffmpeg: { args: ['-version'], readsVersion: true },
  ffprobe: { args: ['-version'], readsVersion: true },
  'yt-dlp': { args: ['--version'], readsVersion: true },
  demucs: { args: ['--help'], readsVersion: false },
  uv: { args: ['--version'], readsVersion: true }
}

/** Runs a tool for its own sake, throwing what it said if it will not. */
export async function runTool(path: string, args: string[], timeout: number): Promise<void> {
  await run(path, args, { timeout })
}

/** What the tool calls itself, or null when it will not say. */
export async function askVersion(tool: ProvidedTool, path: string): Promise<string | null> {
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

/** What a run that did not work has to say for itself, in a few words. */
interface RunFailure {
  code?: number | string
  signal?: NodeJS.Signals | null
  killed?: boolean
  stderr?: string
  message?: string
}

/**
 * Why a program would not run, in words worth putting in front of somebody.
 *
 * "It would not run" is true of every one of these and useful for none of
 * them: a copy the machine refused to start, one that ran and complained, and
 * one that was still unpacking itself when we gave up are three different
 * problems with three different answers.
 */
export function reasonForFailure(error: unknown, waitedMs: number): string {
  const failed = (error ?? {}) as RunFailure
  const said = (failed.stderr ?? '').trim().split('\n')[0]?.trim() ?? ''
  const alsoSaid = said === '' ? '' : `: ${said}`

  if (failed.killed === true) return `it had not answered after ${Math.round(waitedMs / 1000)} seconds`
  /* A machine refusing to start a program it will not vouch for kills it
     outright — on macOS that is an unsigned build being turned away. */
  if (failed.signal === 'SIGKILL') return 'the system stopped it outright, which is what it does to a program it will not let run'
  if (typeof failed.signal === 'string') return `it was stopped with ${failed.signal}`
  if (failed.code === 'ENOENT') return 'there was nothing there to run'
  if (typeof failed.code === 'number') return `it exited with code ${failed.code}${alsoSaid}`
  if (typeof failed.code === 'string') return `${failed.code}${alsoSaid}`
  return said === '' ? (failed.message ?? 'it did not say why') : said
}

/**
 * Why the program at this path is not the working tool, or null when it is.
 *
 * A download cut off part way through leaves a file that is the right size to
 * look plausible and the wrong shape to run, so a fetched copy is asked to do
 * something before it is kept — and what it said when it would not is the
 * whole of what anybody has to go on afterwards.
 */
export async function whyItWillNotRun(tool: ProvidedTool, path: string): Promise<string | null> {
  try {
    await run(path, PROBES[tool].args, { timeout: FIRST_RUN_TIMEOUT_MS })
    return null
  } catch (error) {
    return reasonForFailure(error, FIRST_RUN_TIMEOUT_MS)
  }
}
