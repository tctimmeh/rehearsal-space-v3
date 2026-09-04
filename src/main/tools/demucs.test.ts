import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEMUCS_MODELS } from '../../shared/stems'
import type { ToolInstall } from '../../shared/tools'
import { JobFailedError, type JobSpec } from '../jobs/manager'
import { createDemucsInstaller, type DemucsInstallerOptions } from './demucs'
import { demucsLayout } from './demucsEnv'

const linux = { platform: 'linux', arch: 'x64' }

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'demucs-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

const layoutIn = () => demucsLayout(directory, 'linux')

/** uv arriving, as the real fetch would leave it. */
const fetchUv: DemucsInstallerOptions['fetchUv'] = async (layout) => {
  await mkdir(layout.root, { recursive: true })
  await writeFile(layout.uv, '#!/bin/sh\n', { mode: 0o755 })
}

/** The job runner, which by default builds what the real one would leave. */
const buildsItFor = async (platform: string): Promise<void> => {
  const layout = demucsLayout(directory, platform)
  await mkdir(join(layout.venv, 'bin'), { recursive: true })
  await mkdir(layout.cache, { recursive: true })
  await mkdir(layout.pythons, { recursive: true })
  await writeFile(layout.demucs, '#!/bin/sh\n', { mode: 0o755 })
}

const buildsIt = async (): Promise<void> => {
  const layout = layoutIn()
  await mkdir(join(layout.venv, 'bin'), { recursive: true })
  await mkdir(layout.cache, { recursive: true })
  await mkdir(layout.pythons, { recursive: true })
  await writeFile(layout.demucs, '#!/bin/sh\n', { mode: 0o755 })
}

const installerWith = (over: Partial<DemucsInstallerOptions> = {}) => {
  const specs: JobSpec[] = []
  const said: (ToolInstall | null)[] = []
  const installer = createDemucsInstaller({
    directory,
    machine: linux,
    systemPath: '/usr/bin',
    run: async (spec) => {
      specs.push(spec)
      await buildsIt()
    },
    fetchUv,
    announce: (install) => said.push(install),
    ...over
  })
  return { installer, specs, said }
}

const there = async (path: string): Promise<boolean> =>
  readdir(path).then(
    () => true,
    () => false
  )

describe('installing demucs', () => {
  it('fetches uv, then has it build the environment', async () => {
    const uv = vi.fn(fetchUv)
    const { installer, specs } = installerWith({ fetchUv: uv })

    await installer.install()

    expect(uv).toHaveBeenCalledOnce()
    expect(specs).toHaveLength(1)
    expect(specs[0]?.title).toBe('Installing demucs')
    expect(specs[0]?.steps[0]?.command).toBe(layoutIn().uv)
    expect(specs[0]?.steps[1]?.args).toContain('--torch-backend=cpu')
  })

  /* The dialog offers both models. Fetching only one leaves a separation with
     the other sitting silent for minutes the first time it is asked for. */
  it('fetches the weights of every model the app offers', async () => {
    const { installer, specs } = installerWith()

    await installer.install()

    const asked = (specs[0]?.steps ?? []).flatMap((step) => step.args.join(' '))
    for (const model of DEMUCS_MODELS) {
      expect(asked.some((args) => args.includes(`get_model("${model.id}")`))).toBe(true)
    }
  })

  /* Installed is not the same as working: a demucs that will not import is
     worth finding out about now, with the reason in the job's log. */
  it('ends by running the demucs it just built', async () => {
    const { installer, specs } = installerWith()

    await installer.install()

    expect(specs[0]?.steps.at(-1)?.command).toBe(layoutIn().demucs)
  })

  it('runs every step inside its own directory', async () => {
    const { installer, specs } = installerWith()

    await installer.install()

    for (const step of specs[0]?.steps ?? []) {
      expect(step.env?.['UV_CACHE_DIR']).toBe(layoutIn().cache)
      expect(step.env?.['HF_HOME']).toBe(layoutIn().models)
      /* The app's own ffmpeg, which demucs falls back to for audio it cannot
         read itself, is not on the machine's PATH. */
      expect(step.env?.['PATH']).toBe(`${directory}:/usr/bin`)
    }
  })

  /* uv links wheels out of its cache into the environment, so the cache is
     several hundred megabytes of nothing once the environment is built. */
  it('clears the wheel cache once it is built', async () => {
    const { installer } = installerWith()

    await installer.install()

    expect(await there(layoutIn().cache)).toBe(false)
    expect(await there(layoutIn().venv)).toBe(true)
  })

  it('presses once however many times it is asked', async () => {
    const run = vi.fn(buildsIt)
    const { installer } = installerWith({ run })

    await Promise.all([installer.install(), installer.install(), installer.install()])

    expect(run).toHaveBeenCalledOnce()
  })

  it('says what it is doing, and stops saying it once it is done', async () => {
    const { installer, said } = installerWith()

    await installer.install()

    expect(said.some((one) => one?.state === 'fetching')).toBe(true)
    expect(said.at(-1)).toBeNull()
    expect(installer.underway()).toBeNull()
  })
})

describe('when it does not work', () => {
  const failing = (error: unknown) => installerWith({ run: () => Promise.reject(error) })

  /* Half an environment is worth nothing and takes a gigabyte. uv and the
     Python it fetched are still good, and a retry should not repeat them. */
  it('clears away the half-built environment, keeping what is still good', async () => {
    const { installer } = failing(new JobFailedError('uv exited with code 1', []))
    await mkdir(join(layoutIn().venv, 'bin'), { recursive: true })
    await mkdir(layoutIn().pythons, { recursive: true })

    await installer.install()

    expect(await there(layoutIn().venv)).toBe(false)
    expect(await there(layoutIn().cache)).toBe(false)
    expect(await there(layoutIn().pythons)).toBe(true)
  })

  it('holds on to why, for the tools panel to show', async () => {
    const { installer } = failing(new JobFailedError('uv exited with code 1', []))

    await installer.install()

    expect(installer.underway()).toEqual({
      tool: 'demucs',
      state: 'failed',
      progress: null,
      error: 'uv exited with code 1'
    })
  })

  /* The queue reports what it ran, with its log. Throwing as well would put
     the same failure in a red banner across the top of the app. */
  it('leaves a job that failed to the job queue to report', async () => {
    const { installer } = failing(new JobFailedError('uv exited with code 1', []))

    await expect(installer.install()).resolves.toBeUndefined()
  })

  /* Stopping something is not the same as it going wrong. */
  it('says nothing was wrong when the user cancelled it', async () => {
    const { installer } = failing(new JobFailedError('Cancelled', [], true))

    await installer.install()

    expect(installer.underway()).toBeNull()
    expect(await there(layoutIn().venv)).toBe(false)
  })

  it('will not start on a machine nobody publishes the parts for', async () => {
    const run = vi.fn(buildsIt)
    const { installer } = installerWith({ machine: { platform: 'win32', arch: 'arm64' }, run })

    await expect(installer.install()).rejects.toThrow(/PyTorch/)
    expect(run).not.toHaveBeenCalled()
  })

  /* Where the newest demucs cannot go, an older one that can goes instead —
     and the install is the same install, with different pins. */
  it('installs the older one where the newest cannot go', async () => {
    const specs: JobSpec[] = []
    const mac = createDemucsInstaller({
      directory,
      machine: { platform: 'darwin', arch: 'x64' },
      systemPath: '/usr/bin',
      run: async (spec) => {
        specs.push(spec)
        await buildsItFor('darwin')
      },
      fetchUv
    })

    await mac.install()

    expect(specs[0]?.steps[1]?.args.join(' ')).toContain('demucs==4.0.1')
    expect(specs[0]?.steps[0]?.args).toContain('3.11')
  })

  it('says so plainly when there is no room for it', async () => {
    const run = vi.fn(buildsIt)
    const { installer } = installerWith({ run, roomAt: async () => 2 * 1024 ** 3 })

    await expect(installer.install()).rejects.toThrow(/free/)
    expect(run).not.toHaveBeenCalled()
  })

  it('goes ahead when the disk will not say how full it is', async () => {
    const { installer } = installerWith({ roomAt: async () => null })

    await expect(installer.install()).resolves.toBeUndefined()
  })
})

describe('taking it away again', () => {
  it('takes the whole of it, uv and Python and models', async () => {
    const { installer } = installerWith()
    await installer.install()

    await installer.remove()

    expect(await there(layoutIn().root)).toBe(false)
  })

  it('is happy enough when there is nothing there', async () => {
    const { installer } = installerWith()

    await expect(installer.remove()).resolves.toBeUndefined()
  })
})
