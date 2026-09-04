import { mkdir, rm, statfs } from 'node:fs/promises'

import { uvProgress } from '@core/jobs/progress'
import { DEMUCS_MODELS } from '../../shared/stems'
import type { ToolInstall } from '../../shared/tools'
import { JobFailedError, type JobSpec } from '../jobs/manager'
import {
  confinedEnv,
  demucsInstallable,
  demucsLayout,
  installSteps,
  recipeFor,
  type DemucsLayout
} from './demucsEnv'
import type { Machine } from './releases'

/**
 * demucs, built by the app for itself.
 *
 * The other tools are one file to download. This one is a Python program with
 * an environment behind it, so the app fetches `uv` — one static binary from
 * Astral — and has it build a private Python and install demucs from PyPI,
 * with PyTorch's own processor-only build. Everything lands inside one
 * directory that removing takes away whole.
 *
 * Nobody gets any of this without asking for it: it is the better part of a
 * gigabyte, and only somebody separating a track wants it at all.
 */

/** Below this there is no point starting: wheels unpack to several times their size. */
const ROOM_NEEDED_BYTES = 3 * 1024 ** 3

export interface DemucsInstallerOptions {
  /** The app's tools directory; demucs gets a directory inside it. */
  directory: string
  machine?: Machine
  systemPath?: string
  run: (spec: JobSpec) => Promise<void>
  /** Puts uv in place if it is not already, saying how far through it is. */
  fetchUv: (layout: DemucsLayout, onProgress: (fraction: number | null) => void) => Promise<void>
  announce?: (install: ToolInstall | null) => void
  /** How much room there is where this is going. Null when it will not say. */
  roomAt?: (directory: string) => Promise<number | null>
}

export interface DemucsInstaller {
  /** Where the app's own demucs is, whether or not there is one there yet. */
  pathTo(): string
  /** The environment it has to be run with, wherever it is run from. */
  environment(): Record<string, string | undefined>
  /** Why this machine cannot have it, or null when it can. */
  installable(): string | null
  install(): Promise<void>
  remove(): Promise<void>
  underway(): ToolInstall | null
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** How much room there is where this is going, or null when it will not say. */
async function roomOnDisk(directory: string): Promise<number | null> {
  try {
    const { bsize, bavail } = await statfs(directory)
    return bsize * bavail
  } catch {
    return null
  }
}

const gigabytes = (bytes: number): string => `${Math.round(bytes / 1024 ** 3)} GB`

export function createDemucsInstaller({
  directory,
  machine = { platform: process.platform, arch: process.arch },
  systemPath = process.env['PATH'] ?? '',
  run,
  fetchUv,
  announce,
  roomAt = roomOnDisk
}: DemucsInstallerOptions): DemucsInstaller {
  const layout = demucsLayout(directory, machine.platform)
  const environment = (): Record<string, string | undefined> =>
    confinedEnv(layout, machine.platform, systemPath)

  let install: ToolInstall | null = null
  /* The stems dialog and the tools panel both offer this. Pressing it twice
     should be pressing it once, not two uvs racing into the same directory. */
  let running: Promise<void> | null = null

  const say = (now: ToolInstall | null): void => {
    install = now
    announce?.(now)
  }

  const fetching = (progress: number | null): void =>
    say({ tool: 'demucs', state: 'fetching', progress, error: null })

  /*
   * A half-built environment is worth nothing and takes a gigabyte, so it
   * goes. uv and the Python it fetched stay: they are the slow, dull part,
   * they are still good, and whoever just watched this fail is about to try
   * again.
   */
  const clearAway = async (): Promise<void> => {
    await rm(layout.venv, { recursive: true, force: true })
    await rm(layout.cache, { recursive: true, force: true })
    await rm(layout.incoming, { recursive: true, force: true })
  }

  const build = async (): Promise<void> => {
    const why = demucsInstallable(machine)
    if (why !== null) throw new Error(why)

    const room = await roomAt(directory)
    if (room !== null && room < ROOM_NEEDED_BYTES) {
      throw new Error(
        `There is ${gigabytes(room)} free where this would go, and it needs about ${gigabytes(ROOM_NEEDED_BYTES)}.`
      )
    }

    fetching(null)
    await mkdir(layout.root, { recursive: true })
    /* An environment left over from a failed attempt is not built upon. */
    await rm(layout.venv, { recursive: true, force: true })

    try {
      await fetchUv(layout, fetching)
      /* From here the job queue is the thing to watch; the tools panel keeps
         saying "installing" so the row does not fall quiet halfway. */
      fetching(null)

      const recipe = recipeFor(machine)
      if (recipe === null) throw new Error(demucsInstallable(machine) ?? 'It cannot go here.')

      await run({
        title: 'Installing demucs',
        detail: `${recipe.packages[0] ?? 'demucs'} · Python ${recipe.python}`,
        subject: 'other',
        steps: installSteps(
          layout,
          recipe,
          DEMUCS_MODELS.map((model) => model.id),
          environment(),
          uvProgress
        )
      })

      /* uv links wheels out of its cache into the environment rather than
         copying them — both are inside this directory, so it is always a link
         — which means the environment keeps them when the cache goes. Several
         hundred megabytes for nothing otherwise. */
      await rm(layout.cache, { recursive: true, force: true })
      say(null)
    } catch (error) {
      await clearAway()
      /* Stopping something is not the same as it going wrong: a red row
         saying it could not be installed would be a lie about what happened. */
      if (error instanceof JobFailedError && error.cancelled) {
        say(null)
        return
      }
      say({ tool: 'demucs', state: 'failed', progress: null, error: message(error) })
      /* Anything that got as far as the queue has reported itself there,
         with its log. Only what never started is worth throwing. */
      if (!(error instanceof JobFailedError)) throw error
    }
  }

  return {
    pathTo: () => layout.demucs,
    environment,
    installable: () => demucsInstallable(machine),
    underway: () => install,

    install: () => {
      running ??= build().finally(() => {
        running = null
      })
      return running
    },

    remove: async () => {
      await rm(layout.root, { recursive: true, force: true })
      say(null)
    }
  }
}
