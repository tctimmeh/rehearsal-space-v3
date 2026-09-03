import { chmod, mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { FETCHED_TOOLS, type FetchedTool, type ToolInstall } from '../../shared/tools'
import { downloadTo, findNamed, unpackTarXz } from './fetch'
import { answersAsTool } from './probe'
import { releasesFor, type Download, type Release } from './releases'
import { isRunnable } from './runnable'

/**
 * The app's own copies of the tools it runs.
 *
 * A song cannot be imported, recorded or downloaded without ffmpeg, and the
 * one on the machine belongs to the machine: a distribution upgrade, a removed
 * package, a broken PATH, and the app stops working through no fault of its
 * own. So it keeps copies of its own where nothing else will touch them, and
 * fetches them from where each project publishes its releases when they are
 * not there.
 */
export interface ToolCopies {
  /** Where the copy of a tool lives, whether or not there is one there yet. */
  pathTo(tool: FetchedTool): string
  /** Fetches whatever is missing. Safe to call on every start. */
  ensure(): Promise<void>
  /** Fetches these whether or not they are already here, for an update. */
  refetch(tools: readonly FetchedTool[]): Promise<void>
  /** What is being fetched now, and what could not be. */
  underway(): ToolInstall[]
  watch(onChange: (installs: ToolInstall[]) => void): () => void
}

/** The steps of an install, apart so that they can be stood in for in tests. */
export interface FetchSteps {
  download: typeof downloadTo
  unpack: typeof unpackTarXz
  findNamed: typeof findNamed
  /** Whether what was fetched runs, checked before it is kept. */
  works: (tool: FetchedTool, path: string) => Promise<boolean>
}

interface Options {
  directory: string
  machine?: { platform: string; arch: string }
  steps: FetchSteps
  announce?: (installs: ToolInstall[]) => void
}

/** Progress arrives far faster than anyone can read it. */
const TELL_INTERVAL_MS = 150

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export function createToolCopies({
  directory,
  machine = { platform: process.platform, arch: process.arch },
  steps,
  announce
}: Options): ToolCopies {
  const installs = new Map<FetchedTool, ToolInstall>()
  const watchers = new Set<(installs: ToolInstall[]) => void>()
  let told = 0
  let telling: ReturnType<typeof setTimeout> | null = null

  const underway = (): ToolInstall[] => [...installs.values()]

  const tell = (): void => {
    if (telling !== null) {
      clearTimeout(telling)
      telling = null
    }
    told = Date.now()
    const snapshot = underway()
    announce?.(snapshot)
    for (const watcher of watchers) watcher(snapshot)
  }

  /* Held back rather than dropped: the last thing a download says before it
     goes quiet is worth as much as the rest. */
  const tellSoon = (): void => {
    if (telling !== null) return
    telling = setTimeout(tell, Math.max(0, TELL_INTERVAL_MS - (Date.now() - told)))
  }

  const mark = (tools: readonly FetchedTool[], install: Omit<ToolInstall, 'tool'>): void => {
    for (const tool of tools) installs.set(tool, { tool, ...install })
    tell()
  }

  const unmark = (tools: readonly FetchedTool[]): void => {
    for (const tool of tools) installs.delete(tool)
    tell()
  }

  const pathTo = (tool: FetchedTool): string => join(directory, tool)

  /**
   * Fetched into a room of its own and only moved into place once it has been
   * seen to run, so a download cut off half way through is never mistaken for
   * a tool — and so the app is never caught reading a file as it is written.
   */
  const takeFrom = async (
    { url, packing }: Download,
    tools: readonly FetchedTool[],
    room: string
  ): Promise<void> => {
    const arrival = join(room, 'download')
    await steps.download(url, arrival, (fraction) => {
      for (const tool of tools) {
        const install = installs.get(tool)
        if (install !== undefined) installs.set(tool, { ...install, progress: fraction })
      }
      tellSoon()
    })

    if (packing === 'tar.xz') {
      mark(tools, { state: 'fetching', progress: null, error: null })
      await steps.unpack(arrival, room, [...tools])
    }

    for (const tool of tools) {
      const found = packing === 'plain' ? arrival : await steps.findNamed(room, tool)
      if (found === null) throw new Error(`${url} held no ${tool}`)
      await chmod(found, 0o755)
      if (!(await steps.works(tool, found))) throw new Error(`the ${tool} fetched would not run`)
      await rename(found, pathTo(tool))
    }
  }

  const install = async (release: Release): Promise<void> => {
    const room = join(directory, `incoming-${release.tools[0] ?? 'tool'}`)
    mark(release.tools, { state: 'fetching', progress: null, error: null })
    await rm(room, { recursive: true, force: true })
    await mkdir(room, { recursive: true })
    try {
      let refused: unknown = new Error('nowhere to fetch it from')
      for (const download of release.from) {
        try {
          await takeFrom(download, release.tools, room)
          unmark(release.tools)
          return
        } catch (error) {
          refused = error
        }
      }
      throw refused
    } catch (error) {
      mark(release.tools, { state: 'failed', progress: null, error: message(error) })
    } finally {
      await rm(room, { recursive: true, force: true })
    }
  }

  /* One at a time. Two hundred-megabyte downloads at once take no less time
     between them and make each other's progress look stalled. */
  const fetchAll = async (wanted: readonly FetchedTool[]): Promise<void> => {
    if (wanted.length === 0) return
    await mkdir(directory, { recursive: true })
    for (const release of releasesFor(wanted, machine)) await install(release)
  }

  return {
    pathTo,
    underway,

    ensure: async () => {
      const missing: FetchedTool[] = []
      for (const tool of FETCHED_TOOLS) {
        if (!(await isRunnable(pathTo(tool)))) missing.push(tool)
      }
      await fetchAll(missing)
    },

    refetch: (tools) => fetchAll(tools),

    watch: (onChange) => {
      watchers.add(onChange)
      return () => {
        watchers.delete(onChange)
      }
    }
  }
}

/** The steps as they are really done. */
export const realSteps: FetchSteps = {
  download: downloadTo,
  unpack: unpackTarXz,
  findNamed,
  works: answersAsTool
}
