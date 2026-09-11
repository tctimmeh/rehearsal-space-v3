import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Song } from '@core/song/song'
import { newSong } from '@core/song/song'

/**
 * A take as the recorder hands one over: a second of something, timestamped at
 * the top of the song.
 */
const take = {
  channels: [new Float32Array(48000).fill(0.5)],
  sampleRate: 48000,
  inputLatency: 0,
  songTimeAtFirstSample: 0
}

const recorder = vi.hoisted(() => ({
  endTake: vi.fn(() => take),
  open: vi.fn(async () => undefined),
  close: vi.fn(),
  beginTake: vi.fn(),
  dropTake: vi.fn(),
  isOpen: false
}))

vi.mock('@renderer/audio/recorder', () => ({
  Recorder: class {
    endTake = recorder.endTake
    open = recorder.open
    close = recorder.close
    beginTake = recorder.beginTake
    dropTake = recorder.dropTake
    get isOpen() {
      return recorder.isOpen
    }
  },
  inputDevices: async () => []
}))

/** Held open so the take can be looked at while it is still being kept. */
let holdRecording: (song: Song) => void = () => undefined

async function harness() {
  vi.resetModules()
  recorder.endTake.mockReturnValue(take)

  const bridge = {
    library: {
      list: vi.fn(async () => []),
      load: vi.fn(async (id: string) => newSong(id)),
      save: vi.fn(async (song: Song) => song),
      addRecording: vi.fn(
        (songId: string) =>
          new Promise<Song>((resolve) => {
            holdRecording = resolve
          })
      ),
      rememberLastSong: vi.fn(async () => undefined)
    }
  }
  vi.stubGlobal('window', {
    rehearsal: bridge,
    requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0)
  })
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0))

  const { useSong } = await import('./song')
  const { useJobs } = await import('./jobs')
  await useSong.getState().load('a-song')
  return { useSong, useJobs, bridge }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Runs the loop on until something is true, rather than guessing at turns. */
async function until(ready: () => boolean): Promise<void> {
  for (let turn = 0; turn < 200; turn += 1) {
    if (ready()) return
    await settle()
  }
  throw new Error('waited, and it never happened')
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

/**
 * Turning a take into a file takes a second or two before main has anything to
 * report on, and a window that says nothing for that long after a long
 * recording reads as having lost it.
 */
describe('keeping a take', () => {
  it('says so before the work, not after it', async () => {
    const { useSong, useJobs, bridge } = await harness()

    const keeping = useSong.getState().finishTake()
    await until(() => bridge.library.addRecording.mock.calls.length > 0)

    expect(useJobs.getState().working.map((one) => one.title)).toEqual(['Keeping the take'])

    holdRecording(newSong('a-song'))
    await keeping
  })

  /* The message goes up before anything blocks, so it is on screen while the
     blocking happens rather than after it. */
  it('waits for it to be drawn before starting', async () => {
    const { useSong, useJobs, bridge } = await harness()
    let sayingWhenAsked: string[] = []
    recorder.endTake.mockImplementation(() => {
      sayingWhenAsked = useJobs.getState().working.map((one) => one.title)
      return take
    })

    const keeping = useSong.getState().finishTake()
    await until(() => bridge.library.addRecording.mock.calls.length > 0)
    holdRecording(newSong('a-song'))
    await keeping

    expect(sayingWhenAsked).toEqual(['Keeping the take'])
  })

  it('stops saying it once the take has been handed over', async () => {
    const { useSong, useJobs, bridge } = await harness()

    const keeping = useSong.getState().finishTake()
    await until(() => bridge.library.addRecording.mock.calls.length > 0)
    holdRecording(newSong('a-song'))
    await keeping

    expect(useJobs.getState().working).toEqual([])
  })

  /* A take that captured nothing still has to take the message down. */
  it('stops saying it when there was no take at all', async () => {
    const { useSong, useJobs } = await harness()
    recorder.endTake.mockReturnValue(null as unknown as typeof take)

    await useSong.getState().finishTake()

    expect(useJobs.getState().working).toEqual([])
    expect(useSong.getState().error).toBe('The recording captured nothing.')
  })
})
