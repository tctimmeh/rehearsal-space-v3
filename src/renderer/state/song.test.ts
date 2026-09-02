import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Channel } from '@core/song/song'
import { newSong, type Song } from '@core/song/song'

/**
 * The store is a module singleton, so each test gets a fresh copy of the
 * module with a fresh stub bridge behind it.
 */
interface Harness {
  useSong: typeof import('./song').useSong
  /* Reset between tests, so these must come from the same fresh module graph
     the store itself is using. */
  useTransport: typeof import('./transport').useTransport
  audioEngine: typeof import('../audio/engine').audioEngine
  /** Resolves the save that is currently in flight, as the main process would. */
  completeSave: () => void
  /** Every song handed to the main process, in order. */
  savesStarted: () => Song[]
  inFlight: () => number
  failSave: (reason: string) => void
}

let pendingSaves: {
  song: Song
  resolve: (saved: Song) => void
  reject: (reason: Error) => void
}[] = []
let savesLog: Song[] = []

async function harness(): Promise<Harness> {
  vi.resetModules()
  pendingSaves = []
  savesLog = []

  const bridge = {
    library: {
      list: vi.fn(async () => []),
      create: vi.fn(),
      load: vi.fn(async (id: string) => newSong(id)),
      save: vi.fn((song: Song) => {
        savesLog.push(song)
        return new Promise<Song>((resolve, reject) => {
          pendingSaves.push({ song, resolve, reject })
        })
      }),
      remove: vi.fn(async () => undefined),
      rememberLastSong: vi.fn(async () => undefined)
    }
  }
  vi.stubGlobal('window', { rehearsal: bridge })

  const { useSong } = await import('./song')
  const { useTransport } = await import('./transport')
  const { audioEngine } = await import('../audio/engine')
  return {
    useSong,
    useTransport,
    audioEngine,
    savesStarted: () => savesLog,
    inFlight: () => pendingSaves.length,
    failSave: (reason) => {
      const next = pendingSaves.shift()
      if (next === undefined) throw new Error('No save in flight')
      next.reject(new Error(reason))
    },
    completeSave: () => {
      const next = pendingSaves.shift()
      if (next === undefined) throw new Error('No save in flight')
      /* Main renames the directory to match the title, as the real one does. */
      const id = next.song.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      next.resolve({ ...next.song, id, updatedAt: '2026-08-23T00:00:00.000Z' })
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

describe('the loaded song', () => {
  it('keeps characters typed while a save is in flight', async () => {
    const { useSong, completeSave } = await harness()
    await useSong.getState().load('new-song')

    useSong.getState().update({ title: 'Comeback' })
    await vi.advanceTimersByTimeAsync(500)

    /* The save is away; the user carries on typing. */
    useSong.getState().update({ title: 'Comebacks' })
    completeSave()
    await vi.advanceTimersByTimeAsync(0)

    expect(useSong.getState().song?.title).toBe('Comebacks')
  })

  it('adopts the new id when a title change renames the directory', async () => {
    const { useSong, completeSave } = await harness()
    await useSong.getState().load('new-song')

    useSong.getState().update({ title: 'Coast Road' })
    await vi.advanceTimersByTimeAsync(500)
    completeSave()
    await vi.advanceTimersByTimeAsync(0)

    expect(useSong.getState().song?.id).toBe('coast-road')
  })

  it('never runs two saves at once, so a rename cannot race a stale id', async () => {
    const { useSong, completeSave, savesStarted, inFlight } = await harness()
    await useSong.getState().load('new-song')

    useSong.getState().update({ title: 'Coast' })
    await vi.advanceTimersByTimeAsync(500)
    useSong.getState().update({ title: 'Coast Road' })
    await vi.advanceTimersByTimeAsync(500)

    expect(inFlight()).toBe(1)
    expect(savesStarted()).toHaveLength(1)

    completeSave()
    await vi.advanceTimersByTimeAsync(0)

    /* Only now does the second save go, carrying the id main just settled on. */
    expect(savesStarted()).toHaveLength(2)
    expect(savesStarted()[1]?.title).toBe('Coast Road')
    expect(savesStarted()[1]?.id).toBe('coast')
  })

  it('writes pending edits when flush is awaited, as it is on close', async () => {
    const { useSong, completeSave, savesStarted } = await harness()
    await useSong.getState().load('new-song')

    useSong.getState().update({ title: 'Coast Road' })
    const flushed = useSong.getState().flush()
    await vi.advanceTimersByTimeAsync(0)
    completeSave()
    await flushed

    expect(savesStarted()).toHaveLength(1)
    expect(useSong.getState().song?.id).toBe('coast-road')
  })

  it('does not write a song that is being deleted', async () => {
    const { useSong, savesStarted } = await harness()
    await useSong.getState().load('new-song')

    useSong.getState().update({ title: 'Doomed' })
    await useSong.getState().remove('new-song')
    await vi.advanceTimersByTimeAsync(500)

    expect(savesStarted()).toHaveLength(0)
    expect(useSong.getState().song).toBeNull()
  })

  it('reports a failed save instead of dropping the edit silently', async () => {
    const { useSong, failSave } = await harness()
    await useSong.getState().load('new-song')

    useSong.getState().update({ title: 'Coast Road' })
    await vi.advanceTimersByTimeAsync(500)
    failSave('disk is full')
    await vi.advanceTimersByTimeAsync(0)

    expect(useSong.getState().error).toBe('disk is full')
    /* The edit is still on screen, not reverted to what is on disk. */
    expect(useSong.getState().song?.title).toBe('Coast Road')
  })

  it('drops a save result that arrives after another song was loaded', async () => {
    const { useSong, completeSave } = await harness()
    await useSong.getState().load('new-song')

    useSong.getState().update({ title: 'Coast Road' })
    await vi.advanceTimersByTimeAsync(500)

    const loading = useSong.getState().load('other-song')
    completeSave()
    await loading

    expect(useSong.getState().song?.id).toBe('other-song')
    expect(useSong.getState().song?.title).toBe('New Song')
  })
})

/**
 * Seeking rebuilds every source node, so it belongs to seeking alone. When a
 * fader also seeked, it seeked to the position the UI had last drawn — behind
 * the audio clock — and dragged playback backwards on every pixel of the drag.
 */
describe('the mixer during playback', () => {
  const withChannels = (song: Song, ...channels: Channel[]): Song => ({ ...song, channels })

  const track = (id: string, duration: number): Channel =>
    ({
      kind: 'audio',
      id,
      name: id,
      subject: 'other',
      file: `audio/${id}.ogg`,
      startTime: 0,
      duration,
      gain: 0.8,
      muted: false,
      soloed: false,
      origin: { type: 'record' }
    }) as Channel

  it('does not seek when a fader moves', async () => {
    const { useSong, useTransport, audioEngine } = await harness()
    const seek = vi.spyOn(audioEngine, 'seek')

    useSong.setState({ song: withChannels(newSong('s'), track('a', 45)) })
    useTransport.setState({ start: 0, end: 45 })

    useSong.getState().updateChannel('a', { gain: 0.31 })
    useSong.getState().updateChannel('a', { gain: 0.32 })
    useSong.getState().updateChannel('a', { muted: true })
    useSong.getState().updateBus('music', 0.5)

    expect(seek).not.toHaveBeenCalled()
    expect(useSong.getState().song?.channels[0]?.gain).toBe(0.32)

    /* The spy is watching the right object: an actual seek does reach it. */
    useTransport.getState().seek(12)
    expect(seek).toHaveBeenCalledWith(12)
  })

  it('still follows the timeline when a channel makes the song longer', async () => {
    const { useSong, useTransport } = await harness()
    useSong.setState({ song: withChannels(newSong('s'), track('a', 45)) })
    useTransport.setState({ start: 0, end: 45 })

    useSong.getState().update({ channels: [track('a', 45), track('b', 90)] })

    expect(useTransport.getState().end).toBe(90)
  })
})

describe('reaching the end of the song', () => {
  it('goes back to the beginning, as if it had been stopped', async () => {
    const { useTransport, audioEngine } = await harness()
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => undefined)

    let ended = (): void => undefined
    vi.spyOn(audioEngine, 'whenEnded').mockImplementation((handler) => {
      ended = handler
    })
    const { followEngineClock } = await import('./transport')
    followEngineClock()

    /* A song with a count-in begins before zero, and that is where it returns. */
    useTransport.setState({ start: -4, end: 45, position: 44.9, playing: true })
    ended()

    expect(useTransport.getState().playing).toBe(false)
    expect(useTransport.getState().position).toBe(-4)
  })
})

describe('the library list', () => {
  const listed = (id: string, title: string, artist: string) => ({
    id,
    title,
    artist,
    channelCount: 0,
    hasAudio: false,
    hasLyrics: true,
    hasTabs: false,
    tags: []
  })

  it('follows a change that renames no file, such as the artist', async () => {
    const { useSong, completeSave } = await harness()
    useSong.setState({
      song: { ...newSong('coast-road'), title: 'Coast Road' },
      songs: [listed('coast-road', 'Coast Road', '')]
    })

    useSong.getState().update({ artist: 'The Lowlifes' })
    await vi.advanceTimersByTimeAsync(500)
    completeSave()
    await vi.advanceTimersByTimeAsync(0)

    expect(useSong.getState().songs[0]?.artist).toBe('The Lowlifes')
  })

  it('does not forget things the song file cannot tell it', async () => {
    /* Whether lyrics exist is a file on disk, not a field of the song. */
    const { useSong, completeSave } = await harness()
    useSong.setState({
      song: { ...newSong('coast-road'), title: 'Coast Road' },
      songs: [listed('coast-road', 'Coast Road', '')]
    })

    useSong.getState().update({ artist: 'Somebody' })
    await vi.advanceTimersByTimeAsync(500)
    completeSave()
    await vi.advanceTimersByTimeAsync(0)

    expect(useSong.getState().songs[0]?.hasLyrics).toBe(true)
  })

  it('leaves other songs alone', async () => {
    const { useSong, completeSave } = await harness()
    useSong.setState({
      song: { ...newSong('coast-road'), title: 'Coast Road' },
      songs: [listed('coast-road', 'Coast Road', ''), listed('b-side', 'B Side', 'Someone')]
    })

    useSong.getState().update({ artist: 'The Lowlifes' })
    await vi.advanceTimersByTimeAsync(500)
    completeSave()
    await vi.advanceTimersByTimeAsync(0)

    expect(useSong.getState().songs[1]).toEqual(listed('b-side', 'B Side', 'Someone'))
  })
})

/*
 * Where a song begins is its own business: a count-in is part of the song, so
 * a song with four bars of clicks before 00:00 starts further back than one
 * with two. Loading used to leave the playhead wherever stopping the last song
 * had put it, which for a longer count-in is partway through the count.
 */
describe('where the playhead sits when a song arrives', () => {
  const withCountIn = (id: string, seconds: number): Song => ({
    ...newSong(id),
    id,
    channels: [
      {
        id: 'c1',
        kind: 'audio',
        name: 'Take',
        subject: 'guitar',
        gain: 0,
        muted: false,
        soloed: false,
        file: 'audio/take.wav',
        startTime: -seconds,
        duration: seconds + 60,
        origin: { type: 'record' }
      } as Channel
    ]
  })

  it('goes to the new song, not to where the last one began', async () => {
    const { useSong, useTransport } = await harness()
    window.rehearsal.library.load = vi.fn(async (id: string) =>
      withCountIn(id, id === 'short' ? 2 : 5)
    ) as never

    await useSong.getState().load('short')
    expect(useTransport.getState().position).toBe(-2)

    await useSong.getState().load('long')

    expect(useTransport.getState().start).toBe(-5)
    expect(useTransport.getState().position).toBe(-5)
  })

  it('goes forward to it as readily as back', async () => {
    const { useSong, useTransport } = await harness()
    window.rehearsal.library.load = vi.fn(async (id: string) =>
      withCountIn(id, id === 'long' ? 5 : 2)
    ) as never

    await useSong.getState().load('long')
    await useSong.getState().load('short')

    expect(useTransport.getState().position).toBe(-2)
  })

  it('sits at 00:00 for a song with no count-in at all', async () => {
    const { useSong, useTransport } = await harness()
    window.rehearsal.library.load = vi.fn(async (id: string) =>
      id === 'long' ? withCountIn(id, 5) : newSong(id)
    ) as never

    await useSong.getState().load('long')
    await useSong.getState().load('plain')

    expect(useTransport.getState().position).toBe(0)
  })
})

/* The playhead cannot stand outside the song it is in. */
describe('when the song stops reaching as far as the playhead', () => {
  it('brings the playhead back to the end of what is left', async () => {
    const { useTransport } = await harness()
    useTransport.getState().setBounds(0, 120)
    useTransport.getState().seek(90)

    useTransport.getState().setBounds(0, 40)

    expect(useTransport.getState().position).toBe(40)
  })

  it('leaves it alone when it is still inside', async () => {
    const { useTransport } = await harness()
    useTransport.getState().setBounds(0, 120)
    useTransport.getState().seek(30)

    useTransport.getState().setBounds(-5, 120)

    expect(useTransport.getState().position).toBe(30)
  })
})
