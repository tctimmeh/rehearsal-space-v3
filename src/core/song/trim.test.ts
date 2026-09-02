import { describe, expect, it } from 'vitest'

import type { AudioChannel } from './song'
import {
  keepAll,
  keepPart,
  keptPart,
  LEAST_KEPT,
  placedLike,
  playFrom,
  sourceLength,
  startAt
} from './trim'

const take = (patch: Partial<AudioChannel> = {}): AudioChannel => ({
  id: 'c1',
  kind: 'audio',
  name: 'Take',
  subject: 'guitar',
  gain: 0,
  muted: false,
  soloed: false,
  file: 'audio/take.wav',
  startTime: 0,
  duration: 60,
  origin: { type: 'record' },
  ...patch
})

describe('how long the file is', () => {
  it('is what it plays for, on a channel that has never been trimmed', () => {
    expect(sourceLength(take())).toBe(60)
  })

  it('is what the channel says once it has been', () => {
    expect(sourceLength(take({ offset: 5, duration: 20, sourceDuration: 60 }))).toBe(60)
  })
})

describe('keeping part of a take', () => {
  it('plays from where the kept part begins', () => {
    const kept = keepPart(take(), 10, 40)

    expect(keptPart(kept)).toEqual({ from: 10, to: 40 })
    expect(kept.duration).toBe(30)
  })

  /*
   * The notes are where they are. Cutting a count-in off the front of a take
   * must not drag what is left of it earlier, or every trim is followed by
   * lining the take up again.
   */
  it('leaves the music where it was on the timeline', () => {
    const kept = keepPart(take({ startTime: 4 }), 10, 40)

    expect(kept.startTime).toBe(14)
  })

  it('moves it back when the front is let out again', () => {
    const once = keepPart(take({ startTime: 4 }), 10, 40)
    const back = keepPart(once, 0, 40)

    expect(back.startTime).toBe(4)
    expect(back.duration).toBe(40)
  })

  it('does not move it when only the end is trimmed', () => {
    const kept = keepPart(take({ startTime: 4 }), 0, 30)

    expect(kept.startTime).toBe(4)
    expect(kept.duration).toBe(30)
  })

  /* Trimming is undoing-able because the file is untouched: letting it all
     back in puts the channel exactly where it was to begin with. */
  it('remembers how long the file is, so the rest can be let back in', () => {
    const before = take({ startTime: 4 })
    const kept = keepPart(before, 10, 20)

    expect(kept.sourceDuration).toBe(60)
    expect(keepAll(kept)).toMatchObject({
      offset: 0,
      duration: before.duration,
      startTime: before.startTime
    })
  })

  it('will not reach past either end of the file', () => {
    expect(keptPart(keepPart(take(), -5, 90))).toEqual({ from: 0, to: 60 })
  })

  it('will not be trimmed away to nothing', () => {
    const kept = keepPart(take(), 30, 30)

    expect(kept.duration).toBeCloseTo(LEAST_KEPT, 6)
  })

  it('keeps everything else about the channel', () => {
    const kept = keepPart(take({ name: 'Bass', gain: 0.4, muted: true }), 5, 15)

    expect(kept).toMatchObject({ name: 'Bass', gain: 0.4, muted: true, file: 'audio/take.wav' })
  })
})

describe('moving a channel along the song', () => {
  it('puts it where it is asked for, and plays the same part of the file', () => {
    const moved = startAt(keepPart(take(), 10, 40), 2.5)

    expect(moved.startTime).toBe(2.5)
    expect(keptPart(moved)).toEqual({ from: 10, to: 40 })
  })

  it('will take a count-in before the song begins', () => {
    expect(startAt(take(), -3).startTime).toBe(-3)
  })
})

/*
 * The offset into the file and the offset into the channel are different
 * numbers, and only one of them moves when a take is trimmed. Getting this
 * wrong is inaudible until somebody plays the song from the middle.
 */
describe('what to play when the song reaches a channel', () => {
  const trimmed = keepPart(take({ startTime: 0 }), 10, 40)

  it('waits out a channel that has not come round yet', () => {
    expect(playFrom(take({ startTime: 5 }), 0)).toEqual({ wait: 5, from: 0, length: 60 })
  })

  it('starts a trimmed channel at the part that was kept, not at the file', () => {
    expect(playFrom(trimmed, 0)).toEqual({ wait: 10, from: 10, length: 30 })
  })

  /* Five seconds into the channel is five seconds into the kept part, which
     is fifteen seconds into the file. */
  it('picks up in the middle at the right place in the file', () => {
    expect(playFrom(trimmed, 15)).toEqual({ wait: 0, from: 15, length: 25 })
  })

  it('plays nothing once the channel is behind us', () => {
    expect(playFrom(trimmed, 41)).toBeNull()
  })

  it('plays nothing at the very moment it ends', () => {
    expect(playFrom(trimmed, 40)).toBeNull()
  })

  it('never asks for more of the file than the trim kept', () => {
    for (const at of [0, 10, 20, 30, 39.9]) {
      const play = playFrom(trimmed, at)
      if (play === null) continue
      expect(play.from + play.length).toBeCloseTo(40, 6)
    }
  })

  it('reads an untrimmed channel from the beginning of its file', () => {
    expect(playFrom(take({ startTime: 2 }), 4)).toEqual({ wait: 0, from: 2, length: 58 })
  })
})

/*
 * Separation is given the whole file, so a stem is as long as the file its
 * source came from — which is why the trim carries across as it stands rather
 * than having to be worked out again.
 */
describe('a stem taken out of a take', () => {
  const stem = (): AudioChannel =>
    take({ id: 's1', name: 'Drums', file: 'audio/take-drums.ogg', startTime: 0, duration: 60 })

  it('stands where the take stands', () => {
    const source = startAt(keepPart(take(), 10, 40), 3)

    expect(placedLike(source, stem())).toMatchObject({
      startTime: 3,
      offset: 10,
      duration: 30,
      sourceDuration: 60
    })
  })

  it('plays the same part of the file', () => {
    const source = keepPart(take({ startTime: 2 }), 5, 25)

    expect(keptPart(placedLike(source, stem()))).toEqual(keptPart(source))
  })

  it('takes nothing from an untrimmed take but where it sits', () => {
    const placed = placedLike(startAt(take(), 4), stem())

    expect(placed.offset).toBeUndefined()
    expect(placed).toMatchObject({ startTime: 4, duration: 60, sourceDuration: 60 })
  })

  it('keeps what makes the stem a stem', () => {
    const placed = placedLike(keepPart(take(), 10, 40), stem())

    expect(placed).toMatchObject({ id: 's1', name: 'Drums', file: 'audio/take-drums.ogg' })
  })
})
