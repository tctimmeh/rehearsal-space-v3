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
        (_songId: string, _wav: Uint8Array, _startTime: number, _name: string) =>
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
  await useSong.getState().load('a-song')
  return { useSong, bridge }
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
 * report on, and a mixer with nothing new in it for that long after a long
 * recording reads as having lost it.
 */
describe('a take on its way in', () => {
  it('takes its place in the mixer before the work, not after it', async () => {
    const { useSong, bridge } = await harness()

    const keeping = useSong.getState().finishTake()
    await until(() => bridge.library.addRecording.mock.calls.length > 0)

    expect(useSong.getState().arriving).toEqual(['Take 1'])

    holdRecording(newSong('a-song'))
    await keeping
  })

  /* It is put there before anything blocks, so it is on screen while the
     blocking happens rather than after it. */
  it('is there before the work begins', async () => {
    const { useSong, bridge } = await harness()
    let thereWhenAsked: string[] = []
    recorder.endTake.mockImplementation(() => {
      thereWhenAsked = useSong.getState().arriving
      return take
    })

    const keeping = useSong.getState().finishTake()
    await until(() => bridge.library.addRecording.mock.calls.length > 0)
    holdRecording(newSong('a-song'))
    await keeping

    expect(thereWhenAsked).toEqual(['Take 1'])
  })

  /* Held under the name it will have, so nothing is renamed under the eye as
     the real channel replaces it. */
  it('is given to the channel as the name it was held under', async () => {
    const { useSong, bridge } = await harness()

    const keeping = useSong.getState().finishTake()
    await until(() => bridge.library.addRecording.mock.calls.length > 0)
    holdRecording(newSong('a-song'))
    await keeping

    expect(bridge.library.addRecording.mock.calls[0]?.[3]).toBe('Take 1')
  })

  it('gives up its place once the channel is there', async () => {
    const { useSong, bridge } = await harness()

    const keeping = useSong.getState().finishTake()
    await until(() => bridge.library.addRecording.mock.calls.length > 0)
    holdRecording(newSong('a-song'))
    await keeping

    expect(useSong.getState().arriving).toEqual([])
  })

  /* A take that captured nothing still has to give its place up. */
  it('gives it up when there was no take at all', async () => {
    const { useSong } = await harness()
    recorder.endTake.mockReturnValue(null as unknown as typeof take)

    await useSong.getState().finishTake()

    expect(useSong.getState().arriving).toEqual([])
    expect(useSong.getState().error).toBe('The recording captured nothing.')
  })
})
