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

describe('the key a song is in', () => {
  it('defaults to C major for a song written before there was one', () => {
    expect(migrateSong({}, 'x').key).toEqual({ tonic: 'C', mode: 'major' })
  })

  it('keeps what was chosen', () => {
    expect(migrateSong({ key: { tonic: 'Eb', mode: 'minor' } }, 'x').key).toEqual({
      tonic: 'Eb',
      mode: 'minor'
    })
  })

  it('refuses a tonic that is not a note', () => {
    expect(migrateSong({ key: { tonic: 'H', mode: 'major' } }, 'x').key.tonic).toBe('C')
    expect(migrateSong({ key: { tonic: 42 } }, 'x').key.tonic).toBe('C')
  })

  it('takes anything that is not minor as major', () => {
    expect(migrateSong({ key: { tonic: 'G', mode: 'lydian' } }, 'x').key.mode).toBe('major')
  })
})

describe('the tags on a song', () => {
  it('has none for a song written before there were any', () => {
    expect(migrateSong({}, 'x').tags).toEqual([])
  })

  it('keeps what was there, tidied and in order', () => {
    expect(migrateSong({ tags: ['  gig ', 'acoustic'] }, 'x').tags).toEqual(['acoustic', 'gig'])
  })

  it('drops anything in the file that is not a tag', () => {
    expect(migrateSong({ tags: ['gig', 7, null] }, 'x').tags).toEqual(['gig'])
    expect(migrateSong({ tags: 'gig' }, 'x').tags).toEqual([])
  })
})

/**
 * The stretch being worked on is kept with the song, so it is there tomorrow.
 * A region that is not two numbers the right way round is not a region.
 */
describe('the loop region', () => {
  const read = (loop: unknown) => migrateSong({ schemaVersion: 1, loop }, 'x').loop

  it('is kept', () => {
    expect(read({ start: 12, end: 30 })).toEqual({ start: 12, end: 30 })
  })

  it('is absent in a song that never had one', () => {
    expect(migrateSong({ schemaVersion: 1 }, 'x').loop).toBeNull()
  })

  /* A count-in puts the top of the song before zero. */
  it('may begin before the start of the song', () => {
    expect(read({ start: -4, end: 8 })).toEqual({ start: -4, end: 8 })
  })

  it('is dropped when it has no length', () => {
    expect(read({ start: 12, end: 12 })).toBeNull()
  })

  it('is dropped when it runs backwards', () => {
    expect(read({ start: 30, end: 12 })).toBeNull()
  })

  it('is dropped when it is not numbers', () => {
    expect(read({ start: '12', end: 30 })).toBeNull()
  })
})

/* Aligning a click track became one job among several in the waveform area. */
describe('a tool that has been renamed', () => {
  it('is still open in a song that had the old one open', () => {
    expect(migrateSong({ schemaVersion: 1, openTools: ['align'] }, 'x').openTools).toEqual([
      'waveform'
    ])
  })

  it('does not disturb the others', () => {
    expect(
      migrateSong({ schemaVersion: 1, openTools: ['lyrics', 'align', 'made-up'] }, 'x').openTools
    ).toEqual(['lyrics', 'waveform'])
  })
})

/**
 * Which tab the waveform tool was on and which channel it was looking at come
 * back with the song. The zoom does not: it is not worth a file.
 */
describe('what the waveform tool was doing', () => {
  const read = (waveform: unknown) => migrateSong({ schemaVersion: 1, waveform }, 'x').waveform

  it('is kept', () => {
    expect(read({ tab: 'click', channel: 'bass' })).toEqual({
      tab: 'click',
      channel: 'bass',
      against: null
    })
  })

  /* A song from before there was one has nothing to line up against. */
  it('keeps the channel a take is lined up against, where there is one', () => {
    expect(read({ tab: 'trim', channel: 'vocal', against: 'drums' }).against).toBe('drums')
    expect(read({ tab: 'trim', channel: 'vocal' }).against).toBeNull()
  })

  it('starts on the loop region in a song that never had it open', () => {
    expect(migrateSong({ schemaVersion: 1 }, 'x').waveform).toEqual({
      tab: 'loop',
      channel: null,
      against: null
    })
  })

  it('falls back to the loop region when the tab is not one', () => {
    expect(read({ tab: 'nonsense', channel: 'bass' }).tab).toBe('loop')
  })

  it('forgets a channel that is not a name', () => {
    expect(read({ tab: 'loop', channel: 7 }).channel).toBeNull()
  })
})

/**
 * A song lists its tablature the way it lists its channels, so the order and
 * the names are the song's own rather than whatever the folder happens to
 * return.
 */
describe('the tablature a song has', () => {
  const read = (tabs: unknown) => migrateSong({ schemaVersion: 1, tabs }, 'x').tabs

  it('is kept', () => {
    expect(read([{ id: 'lead', file: 'tabs/lead.txt', name: 'Lead', strings: 6 }])).toEqual([
      { id: 'lead', file: 'tabs/lead.txt', name: 'Lead', strings: 6 }
    ])
  })

  it('is empty in a song that has none', () => {
    expect(migrateSong({ schemaVersion: 1 }, 'x').tabs).toEqual([])
  })

  it('drops an entry that does not say where it is', () => {
    expect(read([{ id: 'lead', name: 'Lead' }])).toEqual([])
  })

  it('assumes six strings when it is not told', () => {
    expect(read([{ id: 'a', file: 'tabs/a.txt', name: 'A' }])[0]?.strings).toBe(6)
  })

  it('is not a bass with a hundred strings', () => {
    expect(read([{ id: 'a', file: 'tabs/a.txt', name: 'A', strings: 100 }])[0]?.strings).toBe(12)
  })
})

/*
 * An electric guitar was a subject of its own and is a guitar now. Left to the
 * ordinary fallback it would come back as "other" — losing its colour, its
 * icon, and the fact that somebody had already said what the channel was.
 */
describe('a subject that has been folded into another', () => {
  const channel = (subject: string) => ({
    id: 'c1',
    name: 'Take',
    subject,
    kind: 'audio',
    file: 'audio/take.ogg',
    startTime: 0,
    duration: 30
  })

  const readSubject = (subject: string) =>
    migrateSong({ schemaVersion: 1, channels: [channel(subject)] }, 'x').channels[0]?.subject

  it('comes back as the one it was folded into', () => {
    expect(readSubject('electric')).toBe('guitar')
  })

  it('leaves every other subject alone', () => {
    for (const subject of ['guitar', 'acoustic', 'bass', 'drums', 'vocals', 'music']) {
      expect(readSubject(subject)).toBe(subject)
    }
  })

  it('still falls back for a subject nobody has ever heard of', () => {
    expect(readSubject('theremin')).toBe('other')
  })
})
