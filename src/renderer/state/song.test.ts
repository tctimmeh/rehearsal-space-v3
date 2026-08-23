import { beforeEach, describe, expect, it, vi } from 'vitest'

import { newSong, type Song } from '@core/song/song'

/**
 * The store is a module singleton, so each test gets a fresh copy of the
 * module with a fresh stub bridge behind it.
 */
interface Harness {
  useSong: typeof import('./song').useSong
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
  return {
    useSong,
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
