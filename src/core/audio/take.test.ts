import { describe, expect, it } from 'vitest'

import { placeTake, takeCorrection, takeRate, trimHead } from './take'

const placement = {
  songTimeAtFirstSample: 30,
  audibleDelay: 0.12,
  inputLatency: 0.02,
  speed: 1,
  earliest: 0
}

describe('placeTake', () => {
  it('puts a take earlier than the clock said, by the whole round trip', () => {
    expect(placeTake(placement).startTime).toBeCloseTo(30 - 0.14, 6)
    expect(placeTake(placement).trimSeconds).toBe(0)
  })

  it('counts less song against the same delay when the song is slowed down', () => {
    /* The latencies are seconds in the room; at 80% the song covers 80% as
       much ground in them. */
    expect(placeTake({ ...placement, speed: 0.8 }).startTime).toBeCloseTo(30 - 0.112, 6)
  })

  it('is exactly the clock when nothing is delayed', () => {
    expect(placeTake({ ...placement, audibleDelay: 0, inputLatency: 0 }).startTime).toBe(30)
  })

  it('respects a timeline that starts before zero', () => {
    expect(
      placeTake({ ...placement, songTimeAtFirstSample: -4, earliest: -8 }).startTime
    ).toBeCloseTo(-4.14, 6)
  })
})

/**
 * Recording from the top used to come back late by the whole round trip: the
 * take wanted to start before 00:00, was clamped to it, and every note in it
 * moved that far later. Measured against a real pair of takes of the same
 * clapping, one from 00:00 and one from mid-song, the gap was 200 ms.
 */
describe('a take that starts at the top of the song', () => {
  const fromTheTop = { ...placement, songTimeAtFirstSample: 0.005 }

  it('does not push the performance later to make room for the latency', () => {
    expect(placeTake(fromTheTop).startTime).toBe(0)
    expect(placeTake(fromTheTop).trimSeconds).toBeCloseTo(0.135, 6)
  })

  it('drops exactly what would have sat before the song was audible', () => {
    const { startTime, trimSeconds } = placeTake(fromTheTop)
    /* Where the kept audio lands is where it was played, either way round. */
    expect(startTime - trimSeconds).toBeCloseTo(0.005 - 0.14, 6)
  })

  it('measures the trim in the take own seconds, not the song ones', () => {
    expect(placeTake({ ...fromTheTop, speed: 0.5 }).trimSeconds).toBeCloseTo(0.13, 6)
  })
})

describe('trimHead', () => {
  const channel = () => Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

  it('drops the samples the head covers', () => {
    const [kept] = trimHead([channel()], 0.3, 10)
    expect([...(kept ?? [])]).toEqual([4, 5, 6, 7, 8, 9, 10])
  })

  it('leaves a take alone when there is nothing to drop', () => {
    expect([...(trimHead([channel()], 0, 10)[0] ?? [])]).toHaveLength(10)
  })

  it('trims every channel by the same amount', () => {
    const trimmed = trimHead([channel(), channel()], 0.2, 10)
    expect(trimmed.map((each) => each.length)).toEqual([8, 8])
  })

  it('comes back empty rather than negative when the take is shorter than the trim', () => {
    expect(trimHead([channel()], 5, 10)[0]).toHaveLength(0)
  })
})

/**
 * The time half of the same job `takeSemitones` does for pitch: a take is
 * performed against the song as it was running, and meets the tempo knob again
 * on the way out.
 */
describe('taking the tempo back off a take', () => {
  it('leaves a take alone when the song was not sped up', () => {
    expect(takeRate(1)).toBe(1)
  })

  /* Recorded against a song going half again as fast, so the performance holds
     half again as much song as its own length suggests. */
  it('reads a take recorded fast more slowly, so it comes out longer', () => {
    expect(takeRate(1.5)).toBeCloseTo(2 / 3, 10)
  })

  it('reads a take recorded slowly faster, so it comes out shorter', () => {
    expect(takeRate(0.5)).toBe(2)
  })

  /* The stretch and the playback resampling are inverses, which is the whole
     point: what goes in at the tempo it was played at comes out at the song's. */
  it('cancels the resampling the take will meet on the way out', () => {
    for (const speed of [0.5, 0.8, 1, 1.25, 1.5, 2]) {
      expect(takeRate(speed) * speed).toBeCloseTo(1, 10)
    }
  })

  it('does not divide by a tempo that is nonsense', () => {
    expect(takeRate(0)).toBe(1)
    expect(takeRate(Number.NaN)).toBe(1)
    expect(takeRate(-1)).toBe(1)
  })
})

/**
 * Both halves come back together on purpose: the tempo half was missing for a
 * while, and nothing about correcting the pitch alone looks incomplete.
 */
describe('what the song was doing to the player', () => {
  const heardAt = (semitones: number, speed: number) => ({
    pitch: { semitones, cents: 0 },
    speed
  })

  /* Negative zero, since undoing nothing is negating nothing. */
  it('has nothing to undo when neither knob was touched', () => {
    const correction = takeCorrection(heardAt(0, 1))

    expect(correction.semitones).toBeCloseTo(0, 10)
    expect(correction.rate).toBe(1)
  })

  it('undoes a key change on its own', () => {
    expect(takeCorrection(heardAt(2, 1))).toEqual({ semitones: -2, rate: 1 })
  })

  /* The case that was silently wrong: a tempo change with no key change looked
     like nothing to do, and the take was kept at the speed it was played. */
  it('undoes a tempo change on its own', () => {
    const correction = takeCorrection(heardAt(0, 1.5))

    expect(correction.semitones).toBeCloseTo(0, 10)
    expect(correction.rate).toBeCloseTo(2 / 3, 10)
  })

  it('undoes both at once, each without disturbing the other', () => {
    const correction = takeCorrection(heardAt(-3, 0.8))

    expect(correction.semitones).toBe(3)
    expect(correction.rate).toBeCloseTo(1.25, 10)
  })
})
