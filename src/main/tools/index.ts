import { delimiter, join } from 'node:path'
import { app } from 'electron'

import { readConfig, updateConfig } from '../config'
import { createToolCopies, realSteps, type ToolCopies } from './copies'
import { askVersion } from './probe'
import { executableName } from './releases'
import { isRunnable } from './runnable'
import {
  EXTERNAL_TOOLS,
  isFetchedTool,
  TOOL_PURPOSE,
  type ExternalTool,
  type FetchedTool,
  type ToolInstall,
  type ToolSource,
  type ToolStatus
} from '../../shared/tools'

/**
 * The app's own copies live beside its settings rather than inside the app:
 * an AppImage is a read-only mount and an installed .deb belongs to root, so
 * the app cannot write to itself — and copies kept here survive it being
 * upgraded, reinstalled, or moved from one packaging to the other.
 */
const privateDirectory = (): string => join(app.getPath('userData'), 'tools')

let copies: ToolCopies | null = null

export function toolCopies(): ToolCopies {
  copies ??= createToolCopies({
    directory: privateDirectory(),
    steps: realSteps,
    announce: () => {
      /* What was found is now different, and the answer is cached. */
      cached = null
    }
  })
  return copies
}

interface Candidate {
  path: string
  source: ToolSource
}

/**
 * A path set in Settings wins, then the app's own copy, then one shipped
 * inside the app, then whatever is on PATH — so a deliberate choice always
 * beats the rest, and what the app fetched for itself beats what the machine
 * happens to have, which is the point of fetching it.
 */
async function searchPaths(tool: ExternalTool): Promise<Candidate[]> {
  const chosen = (await readConfig()).toolPaths[tool]
  /* Windows spells a program's name with a suffix, and demucs is a program
     like any other in that respect. */
  const named = isFetchedTool(tool) ? executableName(tool, process.platform) : tool
  const bundled = app.isPackaged
    ? join(process.resourcesPath, 'bin', named)
    : join(app.getAppPath(), 'resources', 'bin', named)
  const onPath = (process.env['PATH'] ?? '')
    .split(delimiter)
    .filter((entry) => entry !== '')
    .map((entry): Candidate => ({ path: join(entry, named), source: 'system' }))

  return [
    ...(chosen === undefined ? [] : [{ path: chosen, source: 'chosen' as const }]),
    ...(isFetchedTool(tool)
      ? [{ path: toolCopies().pathTo(tool), source: 'private' as const }]
      : []),
    { path: bundled, source: 'bundled' },
    ...onPath
  ]
}

async function locate(tool: ExternalTool): Promise<Candidate | null> {
  for (const candidate of await searchPaths(tool)) {
    if (await isRunnable(candidate.path)) return candidate
  }
  return null
}

/** Probing costs about half a second, and tools rarely appear mid-session. */
let cached: ToolStatus[] | null = null

export async function toolStatus({ refresh = false } = {}): Promise<ToolStatus[]> {
  if (cached !== null && !refresh) return cached
  const found = await Promise.all(
    EXTERNAL_TOOLS.map(async (name): Promise<ToolStatus> => {
      const at = await locate(name)
      return {
        name,
        path: at?.path ?? null,
        version: at === null ? null : await askVersion(name, at.path),
        source: at?.source ?? null,
        purpose: TOOL_PURPOSE[name]
      }
    })
  )
  cached = found
  return found
}

/** Points a tool at a specific binary, or goes back to searching for it. */
export async function setToolPath(tool: ExternalTool, path: string | null): Promise<ToolStatus[]> {
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

/**
 * Fetches the copies the app is missing, at startup.
 *
 * Nothing waits for this: the app runs without these tools, only with less of
 * itself working, and a hundred megabytes of ffmpeg is not something to hold
 * a window shut for.
 */
export function fetchMissingTools(): void {
  void toolCopies()
    .ensure()
    .then(() => {
      cached = null
    })
}

/** Fetches a copy again, for a tool that has gone stale or was never got. */
export async function refetchTool(tool: FetchedTool): Promise<ToolStatus[]> {
  await toolCopies().refetch([tool])
  return toolStatus({ refresh: true })
}

export const toolInstalls = (): ToolInstall[] => toolCopies().underway()

export const watchToolInstalls = (onChange: (installs: ToolInstall[]) => void): (() => void) =>
  toolCopies().watch(onChange)

/** Throws with a message worth showing when a tool a feature needs is absent. */
export async function requireTool(tool: ExternalTool): Promise<string> {
  const at = await locate(tool)
  if (at === null) throw new Error(`${tool} was not found. ${TOOL_PURPOSE[tool]} needs it.`)
  return at.path
}
