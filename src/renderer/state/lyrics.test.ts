// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { newSong } from '@core/song/song'
import { installBridge } from '@renderer/testing/bridge'
import { useSong } from '@renderer/state/song'
import { followSongForLyrics, useLyrics } from './lyrics'

const onDisk = new Map<string, string>()

const wire = () => {
  installBridge()
  const library = window.rehearsal.library as unknown as Record<string, unknown>
  library['readLyrics'] = vi.fn(async (songId: string) => onDisk.get(songId) ?? '')
  library['writeLyrics'] = vi.fn(async (songId: string, text: string) => {
    onDisk.set(songId, text)
  })
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  onDisk.clear()
  wire()
  useLyrics.setState({ songId: null, text: '', saved: true, error: null })
  useSong.setState({ song: null })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('reading and writing', () => {
  it('reads what a song already has', async () => {
    onDisk.set('a-song', 'Counted every mile')

    await useLyrics.getState().load('a-song')

    expect(useLyrics.getState().text).toBe('Counted every mile')
  })

  it('has nothing to show for a song nobody has written words for', async () => {
    await useLyrics.getState().load('empty')

    expect(useLyrics.getState().text).toBe('')
    expect(useLyrics.getState().error).toBeNull()
  })

  it('waits before writing, rather than saving every keystroke', async () => {
    vi.useFakeTimers()
    await useLyrics.getState().load('a-song')

    for (const text of ['C', 'Co', 'Cou']) useLyrics.getState().edit(text)
    expect(window.rehearsal.library.writeLyrics).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(700)
    expect(window.rehearsal.library.writeLyrics).toHaveBeenCalledTimes(1)
    expect(onDisk.get('a-song')).toBe('Cou')
  })

  it('says so while there is something not yet written', async () => {
    await useLyrics.getState().load('a-song')

    useLyrics.getState().edit('a line')

    expect(useLyrics.getState().saved).toBe(false)
    await useLyrics.getState().flush()
    expect(useLyrics.getState().saved).toBe(true)
  })

  it('reports a write it could not do', async () => {
    const library = window.rehearsal.library as unknown as Record<string, unknown>
    library['writeLyrics'] = vi.fn(async () => {
      throw new Error('read-only file system')
    })
    await useLyrics.getState().load('a-song')

    useLyrics.getState().edit('a line')
    await useLyrics.getState().flush()

    expect(useLyrics.getState().error).toMatch(/read-only/)
  })
})

/**
 * Two songs, one editor. Anything that lets the words of one be written into
 * the other loses work that cannot be got back.
 */
describe('changing song', () => {
  it('saves what was being typed before letting go of it', async () => {
    const unwire = followSongForLyrics()
    useSong.setState({ song: { ...newSong('first'), id: 'first' } })
    await settle()
    useLyrics.getState().edit('half a verse')

    useSong.setState({ song: { ...newSong('second'), id: 'second' } })
    await settle()
    await settle()

    expect(onDisk.get('first')).toBe('half a verse')
    unwire()
  })

  it('does not write one song words into another', async () => {
    onDisk.set('second', 'the other song')
    const unwire = followSongForLyrics()
    useSong.setState({ song: { ...newSong('first'), id: 'first' } })
    await settle()
    useLyrics.getState().edit('first song words')

    useSong.setState({ song: { ...newSong('second'), id: 'second' } })
    await settle()
    await settle()

    expect(useLyrics.getState().songId).toBe('second')
    expect(useLyrics.getState().text).toBe('the other song')
    expect(onDisk.get('second')).toBe('the other song')
    unwire()
  })

  it('empties the editor when the song is unloaded', async () => {
    const unwire = followSongForLyrics()
    useSong.setState({ song: { ...newSong('first'), id: 'first' } })
    await settle()

    useSong.setState({ song: null })
    await settle()

    expect(useLyrics.getState().text).toBe('')
    unwire()
  })
})

describe('transposing', () => {
  it('moves the chords in place and marks the song unsaved', async () => {
    onDisk.set('a-song', ['C       Am', 'Counted every mile'].join('\n'))
    await useLyrics.getState().load('a-song')

    useLyrics.getState().transpose(2)

    expect(useLyrics.getState().text).toBe(['D       Bm', 'Counted every mile'].join('\n'))
    expect(useLyrics.getState().saved).toBe(false)
  })
})
