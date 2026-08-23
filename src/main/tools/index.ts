import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'

import { EXTERNAL_TOOLS, TOOL_PURPOSE, type ExternalTool, type ToolStatus } from '../../shared/tools'

const run = promisify(execFile)

/** Long enough for a cold start, short enough not to stall the Setup view. */
const VERSION_TIMEOUT_MS = 5000

/**
 * Not every tool spells it the same way, and getting it wrong looks exactly
 * like the tool being broken: ffmpeg exits non-zero on `--version`.
 */
const VERSION_ARGS: Record<ExternalTool, string[]> = {
  ffmpeg: ['-version'],
  ffprobe: ['-version'],
  'yt-dlp': ['--version'],
  demucs: ['--version']
}

const isExecutable = async (path: string): Promise<boolean> => {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Tools are expected to live in the app's own directory, but a developer
 * checkout has them on PATH instead. The bundled copy wins so a packaged app
 * behaves the same everywhere.
 */
function searchPaths(tool: ExternalTool): string[] {
  const bundled = app.isPackaged
    ? join(process.resourcesPath, 'bin', tool)
    : join(app.getAppPath(), 'resources', 'bin', tool)

  const pathEntries = (process.env['PATH'] ?? '').split(':').filter((entry) => entry !== '')
  return [bundled, ...pathEntries.map((entry) => join(entry, tool))]
}

async function locate(tool: ExternalTool): Promise<string | null> {
  for (const candidate of searchPaths(tool)) {
    if (await isExecutable(candidate)) return candidate
  }
  return null
}

async function readVersion(tool: ExternalTool, path: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await run(path, VERSION_ARGS[tool], { timeout: VERSION_TIMEOUT_MS })
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
  cached = await Promise.all(
    EXTERNAL_TOOLS.map(async (name) => {
      const path = await locate(name)
      return {
        name,
        path,
        version: path === null ? null : await readVersion(name, path),
        purpose: TOOL_PURPOSE[name]
      }
    })
  )
  return cached
}

/** Throws with a message worth showing when a tool a feature needs is absent. */
export async function requireTool(tool: ExternalTool): Promise<string> {
  const path = await locate(tool)
  if (path === null) {
    throw new Error(`${tool} was not found. ${TOOL_PURPOSE[tool]} needs it.`)
  }
  return path
}
