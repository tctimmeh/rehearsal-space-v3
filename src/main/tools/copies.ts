import { chmod, mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { type DownloadedTool, type ToolInstall } from '../../shared/tools'
import { downloadTo, findNamed, unpack } from './fetch'
import { whyItWillNotRun } from './probe'
import { executableName, releasesFor, type Download, type Machine, type Release } from './releases'
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
  pathTo(tool: DownloadedTool): string
  /** Fetches whichever of these is missing. Safe to call on every start. */
  ensure(tools: readonly DownloadedTool[]): Promise<void>
  /** Fetches these whether or not they are already here, for an update. */
  refetch(tools: readonly DownloadedTool[]): Promise<void>
  /** What is being fetched now, and what could not be. */
  underway(): ToolInstall[]
  watch(onChange: (installs: ToolInstall[]) => void): () => void
}

/** The steps of an install, apart so that they can be stood in for in tests. */
export interface FetchSteps {
  download: typeof downloadTo
  unpack: typeof unpack
  findNamed: typeof findNamed
  /** Why what was fetched will not run, or null when it does. Checked
      before it is kept, and what it says is all anybody has to go on. */
  works: (tool: DownloadedTool, path: string) => Promise<string | null>
}

interface Options {
  directory: string
  machine?: Machine
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
  const installs = new Map<DownloadedTool, ToolInstall>()
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

  const mark = (tools: readonly DownloadedTool[], install: Omit<ToolInstall, 'tool'>): void => {
    for (const tool of tools) installs.set(tool, { tool, ...install })
    tell()
  }

  const unmark = (tools: readonly DownloadedTool[]): void => {
    for (const tool of tools) installs.delete(tool)
    tell()
  }

  /* Named as the platform names a program, so the copy is what a Windows
     PATH would have found and what a launcher would run. */
  const nameOf = (tool: DownloadedTool): string => executableName(tool, machine.platform)

  const pathTo = (tool: DownloadedTool): string => join(directory, nameOf(tool))

  /**
   * Fetched into a room of its own and only moved into place once it has been
   * seen to run, so a download cut off half way through is never mistaken for
   * a tool — and so the app is never caught reading a file as it is written.
   */
  const takeFrom = async (
    { url, packing }: Download,
    tools: readonly DownloadedTool[],
    room: string
  ): Promise<void> => {
    /*
     * Named as the platform names the program, where the download is the
     * program itself.
     *
     * Windows decides what a file is by its extension: asked to run one whose
     * name has none, it appends `.exe` and looks for a file that was never
     * written. So a perfectly good yt-dlp.exe called `download` fails the
     * check that what arrived actually runs, and the copy is thrown away.
     * Nothing unpacked has this problem — it comes out of the archive under
     * its own name — which is why ffmpeg was fine and yt-dlp was not.
     */
    const only = tools.length === 1 ? tools[0] : undefined
    const arrival = join(room, packing === 'plain' && only !== undefined ? nameOf(only) : 'download')
    await steps.download(url, arrival, (fraction) => {
      for (const tool of tools) {
        const install = installs.get(tool)
        if (install !== undefined) installs.set(tool, { ...install, progress: fraction })
      }
      tellSoon()
    })

    if (packing !== 'plain') {
      mark(tools, { state: 'fetching', progress: null, error: null })
      await steps.unpack(packing, arrival, room, tools.map(nameOf))
    }

    for (const tool of tools) {
      const found = packing === 'plain' ? arrival : await steps.findNamed(room, nameOf(tool))
      if (found === null) throw new Error(`${url} held no ${tool}`)
      await chmod(found, 0o755)
      const wrong = await steps.works(tool, found)
      if (wrong !== null) throw new Error(`the ${tool} fetched would not run — ${wrong}`)
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
  const fetchAll = async (wanted: readonly DownloadedTool[]): Promise<void> => {
    if (wanted.length === 0) return
    await mkdir(directory, { recursive: true })
    for (const release of releasesFor(wanted, machine)) await install(release)
  }

  return {
    pathTo,
    underway,

    ensure: async (tools) => {
      const missing: DownloadedTool[] = []
      for (const tool of tools) {
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
  unpack,
  findNamed,
  works: whyItWillNotRun
}
