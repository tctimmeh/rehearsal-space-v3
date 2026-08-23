import { describe, expect, it } from 'vitest'

import { migrateSong, UnreadableSongError } from './migrate'
import { newSong, SONG_SCHEMA_VERSION } from './song'

describe('migrateSong', () => {
  it('returns a usable song from nothing at all', () => {
    const song = migrateSong(undefined, 'new-song')
    expect(song.id).toBe('new-song')
    expect(song.title).toBe('New Song')
    expect(song.channels).toEqual([])
  })

  it('takes identity from the directory, not from a stale id in the file', () => {
    const song = migrateSong({ id: 'old-name', title: 'Coast Road' }, 'coast-road')
    expect(song.id).toBe('coast-road')
  })

  it('refuses a song written by a newer version rather than mangling it', () => {
    expect(() => migrateSong({ schemaVersion: SONG_SCHEMA_VERSION + 1 }, 'x')).toThrow(
      UnreadableSongError
    )
  })

  it('keeps good fields and replaces bad ones', () => {
    const song = migrateSong(
      { title: 'Comeback Season', artist: 42, buses: { music: 0.7, click: 'loud' } },
      'comeback-season'
    )
    expect(song.title).toBe('Comeback Season')
    expect(song.artist).toBe('')
    expect(song.buses.music).toBe(0.7)
    expect(song.buses.click).toBe(newSong('x').buses.click)
  })

  it('clamps values that would break playback', () => {
    const song = migrateSong({ playback: { speed: 99, pitch: -400 } }, 'x')
    expect(song.playback.speed).toBe(1.5)
    expect(song.playback.pitch).toEqual({ semitones: -12, cents: 0 })
  })

  it('drops audio channels with no file, since they can never play', () => {
    const song = migrateSong(
      {
        channels: [
          { kind: 'audio', id: 'a', name: 'Vocals', subject: 'vocals', file: 'audio/a.ogg' },
          { kind: 'audio', id: 'b', name: 'Broken', subject: 'bass' }
        ]
      },
      'x'
    )
    expect(song.channels).toHaveLength(1)
    expect(song.channels[0]?.id).toBe('a')
  })

  it('keeps metronome channels, which have no file by nature', () => {
    const song = migrateSong(
      {
        channels: [
          {
            kind: 'metronome',
            id: 'count-in',
            name: 'Count-in',
            subject: 'metronome',
            endTime: 0,
            duration: { mode: 'measures', bpm: 104, measures: 4, beatsPerMeasure: 4 }
          }
        ]
      },
      'x'
    )
    const channel = song.channels[0]
    expect(channel?.kind).toBe('metronome')
    expect(channel?.kind === 'metronome' && channel.duration.mode).toBe('measures')
  })

  it('falls back to an unknown subject rather than dropping the channel', () => {
    const song = migrateSong(
      { channels: [{ kind: 'audio', id: 'a', subject: 'kazoo', file: 'audio/a.ogg' }] },
      'x'
    )
    expect(song.channels[0]?.subject).toBe('other')
  })

  it('ignores tools it does not recognise', () => {
    const song = migrateSong({ openTools: ['lyrics', 'karaoke', 7] }, 'x')
    expect(song.openTools).toEqual(['lyrics'])
  })
})

describe('pitch', () => {
  it('splits the old single fractional semitone value into semitones and cents', () => {
    expect(migrateSong({ playback: { pitch: -2.25 } }, 'x').playback.pitch).toEqual({
      semitones: -2,
      cents: -25
    })
    expect(migrateSong({ playback: { pitch: 3 } }, 'x').playback.pitch).toEqual({
      semitones: 3,
      cents: 0
    })
  })

  it('reads the split form', () => {
    expect(migrateSong({ playback: { pitch: { semitones: 1, cents: 40 } } }, 'x').playback.pitch)
      .toEqual({ semitones: 1, cents: 40 })
  })

  it('clamps each part to its own range and keeps semitones whole', () => {
    expect(migrateSong({ playback: { pitch: { semitones: 99.6, cents: -400 } } }, 'x').playback.pitch)
      .toEqual({ semitones: 12, cents: -50 })
  })

  it('falls back rather than inventing a pitch from nonsense', () => {
    expect(migrateSong({ playback: { pitch: 'high' } }, 'x').playback.pitch).toEqual({
      semitones: 0,
      cents: 0
    })
  })
})
