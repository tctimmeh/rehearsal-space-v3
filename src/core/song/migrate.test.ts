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
            startTime: -2,
            endTime: 0,
            bpm: 120
          }
        ]
      },
      'x'
    )
    expect(song.channels[0]?.kind).toBe('metronome')
  })

  const legacy = (duration: unknown, extra: Record<string, unknown> = {}) =>
    migrateSong(
      {
        channels: [
          {
            kind: 'metronome',
            id: 'c',
            name: 'Count-in',
            subject: 'metronome',
            endTime: 0,
            duration,
            ...extra
          }
        ]
      },
      'x'
    ).channels[0]

  it('turns a length counted in measures into the two times it amounts to', () => {
    /* Two bars of four at 120bpm ending at zero is four seconds of clicks. */
    const channel = legacy({ mode: 'measures', bpm: 120, measures: 2, beatsPerMeasure: 4 })

    expect(channel?.kind === 'metronome' && channel.startTime).toBeCloseTo(-4, 6)
    expect(channel?.kind === 'metronome' && channel.bpm).toBe(120)
    expect(channel?.kind === 'metronome' && channel.beatsPerMeasure).toBe(4)
  })

  it('carries an odd time signature through the conversion', () => {
    /* Two bars of three at 90bpm: six beats of two thirds of a second. */
    const channel = legacy({ mode: 'measures', bpm: 90, measures: 2 }, { beatsPerMeasure: 3 })
    expect(channel?.kind === 'metronome' && channel.startTime).toBeCloseTo(-4, 6)
  })

  it('takes a length pinned by start time as it stands', () => {
    const channel = legacy({ mode: 'startTime', approxBpm: 104, startTime: -3.25 })

    expect(channel?.kind === 'metronome' && channel.startTime).toBe(-3.25)
    expect(channel?.kind === 'metronome' && channel.bpm).toBe(104)
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
