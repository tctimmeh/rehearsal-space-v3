import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FETCHED_AT_START, type DownloadedTool, type ToolInstall } from '../../shared/tools'
import { createToolCopies, type FetchSteps } from './copies'

const linux = { platform: 'linux', arch: 'x64' }

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tool-copies-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

/** A stand-in for the network: writes the file it was asked to download. */
const steps = (over: Partial<FetchSteps> = {}): FetchSteps => ({
  download: async (url, path) => {
    await writeFile(path, `the program from ${url}`)
  },
  /* The real archives hold a directory whose name nobody should rely on. */
  unpack: async (_packing, archive, into, names) => {
    const held = join(into, 'ffmpeg-7.1-amd64-static')
    await mkdir(held, { recursive: true })
    for (const name of names) await writeFile(join(held, name), await readFile(archive))
  },
  findNamed: async (root, name) => {
    const at = join(root, 'ffmpeg-7.1-amd64-static', name)
    return (await readFile(at).catch(() => null)) === null ? null : at
  },
  works: async () => null,
  ...over
})

const copiesIn = (over: Partial<FetchSteps> = {}, announce: (i: ToolInstall[]) => void = () => {}) =>
  createToolCopies({ directory, machine: linux, steps: steps(over), announce })

/** What is in the copy the app kept, by the name it is kept under. */
const kept = async (name: string): Promise<string | null> =>
  readFile(join(directory, name), 'utf8').catch(() => null)

/** A copy already in place, as a previous run would have left it. */
const already = async (tool: DownloadedTool, text = 'an older copy'): Promise<void> => {
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, tool), text)
  await chmod(join(directory, tool), 0o755)
}

describe('the copies the app keeps', () => {
  it('fetches every tool it has none of', async () => {
    await copiesIn().ensure(FETCHED_AT_START)

    expect(await kept('ffmpeg')).toMatch(/johnvansickle/)
    expect(await kept('ffprobe')).toMatch(/johnvansickle/)
    expect(await kept('yt-dlp')).toMatch(/yt-dlp/)
  })

  it('leaves the copies it already has alone', async () => {
    await already('ffmpeg')
    await already('ffprobe')
    await already('yt-dlp')
    const download = vi.fn()

    await copiesIn({ download }).ensure(FETCHED_AT_START)

    expect(download).not.toHaveBeenCalled()
    expect(await kept('ffmpeg')).toBe('an older copy')
  })

  /* ffprobe comes out of the ffmpeg tarball, so having one and not the other
     means fetching it, and the one already here is replaced from the same
     download rather than left a version apart from its pair. */
  it('fetches the pair when only one of them is missing', async () => {
    await already('ffmpeg')

    await copiesIn().ensure(FETCHED_AT_START)

    expect(await kept('ffprobe')).toMatch(/johnvansickle/)
    expect(await kept('ffmpeg')).toMatch(/johnvansickle/)
  })

  it('fetches a copy again when asked, though there is one already', async () => {
    await already('yt-dlp')

    await copiesIn().refetch(['yt-dlp'])

    expect(await kept('yt-dlp')).toMatch(/yt-dlp/)
  })

  /* One host being down is not the app being without ffmpeg. */
  it('tries the next place it is published when one will not answer', async () => {
    const download = vi.fn(async (url: string, path: string) => {
      if (url.includes('johnvansickle')) throw new Error('host is down')
      await writeFile(path, `the program from ${url}`)
    })

    await copiesIn({ download }).ensure(FETCHED_AT_START)

    expect(await kept('ffmpeg')).toMatch(/BtbN/)
  })

  /*
   * A download cut off part way through is the right size to look plausible
   * and the wrong shape to run. Keeping one would break the app in a way that
   * looks like the tool itself being broken.
   */
  it('keeps nothing that will not run', async () => {
    const works = vi.fn(async () => 'it exited with code 1')

    await copiesIn({ works }).ensure(FETCHED_AT_START)

    expect(await kept('yt-dlp')).toBeNull()
  })

  /* "It would not run" is true of everything that goes wrong here and useful
     for none of it. What the copy said is the whole of what anybody has to go
     on, so it is carried into the message rather than dropped. */
  it('says what the copy that would not run said', async () => {
    const copies = copiesIn({
      works: async () => 'the system stopped it outright'
    })

    await copies.refetch(['yt-dlp'])

    expect(copies.underway()[0]?.error).toContain('the system stopped it outright')
  })

  it('leaves the copy it had when fetching another fails', async () => {
    await already('yt-dlp')

    await copiesIn({ download: async () => Promise.reject(new Error('no route to host')) }).refetch([
      'yt-dlp'
    ])

    expect(await kept('yt-dlp')).toBe('an older copy')
  })

  it('clears up after itself, leaving only the tools', async () => {
    await copiesIn().ensure(FETCHED_AT_START)

    const { readdir } = await import('node:fs/promises')
    expect((await readdir(directory)).sort()).toEqual(['ffmpeg', 'ffprobe', 'yt-dlp'])
  })

  it('has nowhere to fetch from on a machine nobody publishes for', async () => {
    const download = vi.fn()
    const elsewhere = createToolCopies({
      directory,
      machine: { platform: 'freebsd', arch: 'x64' },
      steps: steps({ download })
    })

    await elsewhere.ensure(FETCHED_AT_START)

    expect(download).not.toHaveBeenCalled()
  })

  /* Where each program is published on its own, each is a download of its own. */
  it('fetches each program separately where that is how they are published', async () => {
    const download = vi.fn(async (url: string, path: string) => {
      await writeFile(path, `the program from ${url}`)
    })
    const mac = createToolCopies({
      directory,
      machine: { platform: 'darwin', arch: 'x64' },
      steps: steps({ download, findNamed: async (root, name) => join(root, name) })
    })

    await mac.ensure(FETCHED_AT_START)

    expect(download.mock.calls.map(([url]) => url).filter((url) => url.includes('ffprobe'))).toHaveLength(1)
  })

  /*
   * Windows decides what a file is by its extension, and will not run one
   * that has none — it appends `.exe` and looks for a file that is not there.
   * So a download that is the program itself has to arrive under the name the
   * program goes by, or the check that it runs throws away a good copy.
   */
  it('downloads a program under the name the platform runs it by', async () => {
    const asked: string[] = []
    const windows = createToolCopies({
      directory,
      machine: { platform: 'win32', arch: 'x64' },
      steps: steps({
        works: async (_tool, path) => {
          asked.push(path)
          return null
        },
        findNamed: async (root, name) => join(root, name)
      })
    })

    await windows.refetch(['yt-dlp'])

    expect(asked.every((path) => path.endsWith('yt-dlp.exe'))).toBe(true)
    expect(await kept('yt-dlp.exe')).toMatch(/yt-dlp/)
  })

  /* A Windows program is called ffmpeg.exe, in the archive and on disk: a copy
     under any other name is not one Windows would run. */
  it('keeps a copy by the name the platform gives it', async () => {
    const asked: string[][] = []
    const windows = createToolCopies({
      directory,
      machine: { platform: 'win32', arch: 'x64' },
      steps: steps({
        unpack: async (_packing, archive, into, names) => {
          asked.push([...names])
          for (const name of names) await writeFile(join(into, name), await readFile(archive))
        },
        findNamed: async (root, name) => join(root, name)
      })
    })

    await windows.ensure(FETCHED_AT_START)

    expect(asked[0]).toEqual(['ffmpeg.exe', 'ffprobe.exe'])
    expect(await kept('ffmpeg.exe')).toMatch(/BtbN/)
    expect(await kept('yt-dlp.exe')).toMatch(/yt-dlp/)
  })
})

describe('what it says while it is fetching', () => {
  it('names what is being fetched, and stops saying so once it is here', async () => {
    const seen: ToolInstall[][] = []
    const copies = copiesIn({}, (installs) => seen.push(installs))

    await copies.ensure(FETCHED_AT_START)

    expect(seen.some((installs) => installs.some((one) => one.tool === 'ffmpeg'))).toBe(true)
    expect(copies.underway()).toEqual([])
  })

  it('says how far through a download is', async () => {
    const seen: ToolInstall[][] = []
    const copies = copiesIn(
      {
        download: async (_url, path, onProgress) => {
          onProgress(0.5)
          /* Progress is paced, so the half-way mark is told between chunks
             rather than the moment it arrives. */
          await new Promise((resolve) => setTimeout(resolve, 250))
          await writeFile(path, 'half way and then the rest')
        }
      },
      (installs) => seen.push(installs)
    )

    await copies.refetch(['yt-dlp'])

    expect(seen.flat().some((one) => one.progress === 0.5)).toBe(true)
  })

  /* An absence has to explain itself; a failed fetch is why a tool is absent. */
  it('holds on to why a fetch failed', async () => {
    const copies = copiesIn({
      download: async () => Promise.reject(new Error('no route to host'))
    })

    await copies.refetch(['yt-dlp'])

    expect(copies.underway()).toEqual([
      { tool: 'yt-dlp', state: 'failed', progress: null, error: 'no route to host' }
    ])
  })
})
