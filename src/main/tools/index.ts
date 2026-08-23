import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'

import { readConfig, updateConfig } from '../config'
import { isRunnable } from './runnable'
import { EXTERNAL_TOOLS, TOOL_PURPOSE, type ExternalTool, type ToolStatus } from '../../shared/tools'

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

/**
 * A path set in Settings wins, then the copy shipped inside the app, then
 * whatever is on PATH — so a packaged app behaves the same everywhere, and a
 * deliberate choice always beats both.
 */
async function searchPaths(tool: ExternalTool): Promise<string[]> {
  const override = (await readConfig()).toolPaths[tool]
  const bundled = app.isPackaged
    ? join(process.resourcesPath, 'bin', tool)
    : join(app.getAppPath(), 'resources', 'bin', tool)
  const onPath = (process.env['PATH'] ?? '')
    .split(':')
    .filter((entry) => entry !== '')
    .map((entry) => join(entry, tool))

  return override === undefined ? [bundled, ...onPath] : [override, bundled, ...onPath]
}

async function locate(tool: ExternalTool): Promise<string | null> {
  for (const candidate of await searchPaths(tool)) {
    if (await isRunnable(candidate)) return candidate
  }
  return null
}

async function readVersion(tool: ExternalTool, path: string): Promise<string | null> {
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

/** Probing costs about half a second, and tools rarely appear mid-session. */
let cached: ToolStatus[] | null = null

export async function toolStatus({ refresh = false } = {}): Promise<ToolStatus[]> {
  if (cached !== null && !refresh) return cached
  const { toolPaths } = await readConfig()
  cached = await Promise.all(
    EXTERNAL_TOOLS.map(async (name) => {
      const path = await locate(name)
      return {
        name,
        path,
        version: path === null ? null : await readVersion(name, path),
        custom: path !== null && path === toolPaths[name],
        purpose: TOOL_PURPOSE[name]
      }
    })
  )
  return cached
}

/** Points a tool at a specific binary, or goes back to searching for it. */
export async function setToolPath(
  tool: ExternalTool,
  path: string | null
): Promise<ToolStatus[]> {
  if (path !== null && !(await isRunnable(path))) {
    throw new Error(`${path} is not an executable file.`)
  }

  const { toolPaths } = await readConfig()
  const next = { ...toolPaths }
  if (path === null) delete next[tool]
  else next[tool] = path

  await updateConfig({ toolPaths: next })
  return toolStatus({ refresh: true })
}

/** Throws with a message worth showing when a tool a feature needs is absent. */
export async function requireTool(tool: ExternalTool): Promise<string> {
  const path = await locate(tool)
  if (path === null) {
    throw new Error(`${tool} was not found. ${TOOL_PURPOSE[tool]} needs it.`)
  }
  return path
}
