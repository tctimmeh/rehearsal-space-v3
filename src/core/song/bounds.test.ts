import { describe, expect, it } from 'vitest'

import { songBounds } from './bounds'
import { newMetronomeChannel, newSong, type Channel, type Song } from './song'

const withChannels = (...channels: Channel[]): Song => ({ ...newSong('s'), channels })

const audio = (startTime: number, duration: number): Channel => ({
  kind: 'audio',
  id: `a${startTime}`,
  name: 'Audio',
  subject: 'other',
  file: 'audio/a.ogg',
  startTime,
  duration,
  gain: 1,
  muted: false,
  soloed: false,
  origin: { type: 'record' }
})

describe('songBounds', () => {
  it('is empty for a song with nothing in it', () => {
    expect(songBounds(newSong('s'))).toEqual([0, 0])
  })

  it('runs from zero to the end of the longest channel', () => {
    expect(songBounds(withChannels(audio(0, 120), audio(0, 240)))).toEqual([0, 240])
  })

  it('reaches back for a count-in, which sits before the music', () => {
    /* One bar of four at 120bpm ending where the song does: two seconds of
       clicks, all of them before zero. */
    const [start, end] = songBounds(withChannels(audio(0, 60), newMetronomeChannel('click', 0)))

    expect(start).toBeCloseTo(-2, 10)
    expect(end).toBe(60)
  })

  it('asks the solver where a metronome starts rather than assuming', () => {
    /* Anchored at its end, so the start is derived — reading endTime alone
       would put the whole channel outside the timeline. */
    const click = {
      ...newMetronomeChannel('click', 8),
      duration: { mode: 'measures' as const, bpm: 60, measures: 2 }
    }
    const [start, end] = songBounds(withChannels(click))

    expect(start).toBeCloseTo(0, 10)
    expect(end).toBe(8)
  })

  it('covers a mid-song click track without moving the start', () => {
    const click = {
      ...newMetronomeChannel('click', 100),
      duration: { mode: 'startTime' as const, approxBpm: 120, startTime: 90 }
    }
    expect(songBounds(withChannels(audio(0, 200), click))).toEqual([0, 200])
  })

  it('takes the earliest of several beginnings', () => {
    const click = newMetronomeChannel('click', 0)
    /* A recording that starts before the song, and a count-in before that. */
    const [start] = songBounds(withChannels(audio(-0.5, 10), click))
    expect(start).toBeCloseTo(-2, 10)
  })

  it('never ends before it starts', () => {
    const [start, end] = songBounds(withChannels(newMetronomeChannel('click', 0)))
    expect(end).toBeGreaterThanOrEqual(start)
  })
})
