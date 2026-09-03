import { delimiter, join } from 'node:path'
import { app } from 'electron'

import { readConfig, updateConfig } from '../config'
import { jobs } from '../jobs'
import { createToolCopies, realSteps, type ToolCopies } from './copies'
import { createDemucsInstaller, type DemucsInstaller } from './demucs'
import { askVersion, runTool } from './probe'
import { executableName } from './releases'
import { isRunnable } from './runnable'
import { updateInPlace, UPDATE_TIMEOUT_MS } from './update'
import {
  EXTERNAL_TOOLS,
  FETCHED_AT_START,
  isDownloadedTool,
  TOOL_PURPOSE,
  type ExternalTool,
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
let demucs: DemucsInstaller | null = null

/** Told whenever what the app has of its own changes, or is changing. */
const changed = (): void => {
  /* What was found is now different, and the answer is cached. */
  cached = null
  for (const listener of listeners) listener(toolInstalls())
}

export function toolCopies(): ToolCopies {
  copies ??= createToolCopies({
    directory: privateDirectory(),
    steps: realSteps,
    announce: changed
  })
  return copies
}

/**
 * demucs, which is built rather than downloaded.
 *
 * uv is fetched into demucs's own directory by a second set of copies rooted
 * there, so it is the same download, unpacking and it-must-run check as every
 * other tool gets — and so that removing demucs takes uv with it.
 */
export function demucsInstaller(): DemucsInstaller {
  demucs ??= createDemucsInstaller({
    directory: privateDirectory(),
    run: (spec) => jobs.run(spec),
    announce: changed,
    fetchUv: async (layout, onProgress) => {
      const forUv = createToolCopies({
        directory: layout.root,
        steps: realSteps,
        announce: (installs) => onProgress(installs[0]?.progress ?? null)
      })
      await forUv.ensure(['uv'])
      const failed = forUv.underway().find((one) => one.state === 'failed')
      if (failed !== undefined) throw new Error(failed.error ?? 'uv could not be fetched')
    }
  })
  return demucs
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
  /* Windows spells a program's name with a suffix, demucs included. */
  const named = executableName(tool, process.platform)
  const own = privatePathFor(tool)
  const bundled = app.isPackaged
    ? join(process.resourcesPath, 'bin', named)
    : join(app.getAppPath(), 'resources', 'bin', named)
  const onPath = (process.env['PATH'] ?? '')
    .split(delimiter)
    .filter((entry) => entry !== '')
    .map((entry): Candidate => ({ path: join(entry, named), source: 'system' }))

  return [
    ...(chosen === undefined ? [] : [{ path: chosen, source: 'chosen' as const }]),
    ...(own === null ? [] : [{ path: own, source: 'private' as const }]),
    { path: bundled, source: 'bundled' },
    ...onPath
  ]
}

/** Where the app's own copy of this would be, if it keeps one at all. */
function privatePathFor(tool: ExternalTool): string | null {
  if (isDownloadedTool(tool)) return toolCopies().pathTo(tool)
  if (tool === 'demucs') return demucsInstaller().pathTo()
  return null
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
 * Puts the app's tools in order, at startup: fetches what is missing, and
 * brings yt-dlp up to date.
 *
 * Nothing waits for any of it: the app runs without these tools, only with
 * less of itself working, and a hundred megabytes of ffmpeg is not something
 * to hold a window shut for. demucs is not among them — it is hundreds of
 * megabytes and nobody is to be given it without being asked.
 */
export function fetchMissingTools(): void {
  void (async () => {
    /* Whether there is one already decides whether updating means anything: a
       copy just fetched is the newest there is. */
    const had = await isRunnable(toolCopies().pathTo('yt-dlp'))
    await toolCopies().ensure(FETCHED_AT_START)
    changed()
    if (had) await catchUpYtDlp()
  })()
}

/**
 * Asks the app's own yt-dlp to update itself.
 *
 * Quietly: no window waits for it, no queue entry, and a failure is not worth
 * saying anything about — no network at startup is an ordinary morning, and
 * the copy that is here still works. What it did show up in is the version the
 * tools panel reports.
 */
async function catchUpYtDlp(): Promise<void> {
  try {
    const ran = await updateInPlace(await locate('yt-dlp'), (path, args) =>
      runTool(path, args, UPDATE_TIMEOUT_MS)
    )
    if (ran) changed()
  } catch {
    /* Stale beats absent, and it will be tried again tomorrow. */
  }
}

/**
 * Puts the app's own copy of a tool in place: fetched, or built where it is
 * demucs. Asked for by the user, every time.
 */
export async function installTool(tool: ExternalTool): Promise<ToolStatus[]> {
  if (tool === 'demucs') await demucsInstaller().install()
  else if (isDownloadedTool(tool)) await toolCopies().refetch([tool])
  else throw new Error(`The app cannot install ${tool}.`)
  return toolStatus({ refresh: true })
}

/** Takes the app's own copy away again, for the room it takes up. */
export async function removeTool(tool: ExternalTool): Promise<ToolStatus[]> {
  if (tool !== 'demucs') throw new Error(`The app cannot remove its ${tool}.`)
  await demucsInstaller().remove()
  return toolStatus({ refresh: true })
}

/** Why this machine cannot have a tool the app would otherwise provide. */
export const whyNotInstallable = (tool: ExternalTool): string | null =>
  tool === 'demucs' ? demucsInstaller().installable() : null

const listeners = new Set<(installs: ToolInstall[]) => void>()

export function toolInstalls(): ToolInstall[] {
  const demucsInstall = demucsInstaller().underway()
  return [...toolCopies().underway(), ...(demucsInstall === null ? [] : [demucsInstall])]
}

export function watchToolInstalls(onChange: (installs: ToolInstall[]) => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** Where a tool is, or null. For anything that can do without it. */
export async function findTool(tool: ExternalTool): Promise<string | null> {
  return (await locate(tool))?.path ?? null
}

/** Throws with a message worth showing when a tool a feature needs is absent. */
export async function requireTool(tool: ExternalTool): Promise<string> {
  const at = await locate(tool)
  if (at === null) throw new Error(`${tool} was not found. ${TOOL_PURPOSE[tool]} needs it.`)
  return at.path
}

/**
 * How to run demucs: where it is, and what it needs around it.
 *
 * The environment matters wherever the program came from. demucs falls back to
 * ffmpeg for audio it cannot read itself — which is every channel here, since
 * they are all ogg — and the app's own ffmpeg is deliberately not on PATH, so
 * without this a machine with no system ffmpeg would fail inside demucs.
 */
export async function demucsCommand(): Promise<{
  path: string
  env: Record<string, string | undefined>
}> {
  return { path: await requireTool('demucs'), env: demucsInstaller().environment() }
}
