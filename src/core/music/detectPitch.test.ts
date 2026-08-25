import { describe, expect, it } from 'vitest'

import { decimate, detectPitch, rms } from './detectPitch'

const RATE = 16000
const LENGTH = 2730

/** A note with the harmonics a plucked string actually has. */
const tone = (
  hz: number,
  { harmonics = 1, rate = RATE, length = LENGTH, gain = 0.3 } = {}
): Float32Array => {
  const samples = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    let value = 0
    for (let harmonic = 1; harmonic <= harmonics; harmonic += 1) {
      value += Math.sin((2 * Math.PI * hz * harmonic * index) / rate) / harmonic
    }
    samples[index] = value * gain
  }
  return samples
}

const noise = (length = LENGTH): Float32Array => {
  const samples = new Float32Array(length)
  let seed = 7
  for (let index = 0; index < length; index += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    samples[index] = (seed / 2147483648) * 2 - 1
  }
  return samples
}

const cents = (heard: number, wanted: number) => 1200 * Math.log2(heard / wanted)

describe('detectPitch', () => {
  it('hears a plain tone', () => {
    const reading = detectPitch(tone(440), { sampleRate: RATE })
    expect(reading).not.toBeNull()
    expect(Math.abs(cents(reading?.frequency ?? 0, 440))).toBeLessThan(1)
  })

  /* The six open strings, which is what this will spend its life doing. */
  it.each([
    ['low E', 82.41],
    ['A', 110.0],
    ['D', 146.83],
    ['G', 196.0],
    ['B', 246.94],
    ['high E', 329.63]
  ])('hears the %s string within a cent', (_name, hz) => {
    const reading = detectPitch(tone(hz, { harmonics: 8 }), { sampleRate: RATE })
    expect(Math.abs(cents(reading?.frequency ?? 0, hz))).toBeLessThan(1)
  })

  /**
   * A plain autocorrelation answers an octave low on anything with a strong
   * second harmonic, which is every string instrument there is.
   */
  it('is not fooled an octave down by a bright, harmonic-rich note', () => {
    const reading = detectPitch(tone(110, { harmonics: 16 }), { sampleRate: RATE })
    expect(Math.abs(cents(reading?.frequency ?? 0, 110))).toBeLessThan(5)
  })

  it('follows a string that is out of tune rather than snapping to a note', () => {
    const reading = detectPitch(tone(103.5, { harmonics: 6 }), { sampleRate: RATE })
    expect(reading?.frequency ?? 0).toBeCloseTo(103.5, 0)
  })

  it('says nothing about silence', () => {
    expect(detectPitch(new Float32Array(LENGTH), { sampleRate: RATE })).toBeNull()
  })

  it('says nothing about a room nobody is playing in', () => {
    const quiet = tone(220, { gain: 0.001 })
    expect(detectPitch(quiet, { sampleRate: RATE })).toBeNull()
  })

  it('says nothing about noise', () => {
    expect(detectPitch(noise(), { sampleRate: RATE })).toBeNull()
  })

  it('is more sure of a clean note than of a scrape', () => {
    const clean = detectPitch(tone(196, { harmonics: 6 }), { sampleRate: RATE })
    const messy = new Float32Array(LENGTH)
    const dirt = noise()
    const note = tone(196, { harmonics: 6 })
    for (let index = 0; index < LENGTH; index += 1) {
      messy[index] = (note[index] as number) + (dirt[index] as number) * 0.25
    }
    const scraped = detectPitch(messy, { sampleRate: RATE })

    expect(clean?.clarity ?? 0).toBeGreaterThan(scraped?.clarity ?? 0)
  })

  it('ignores what is below the lowest note it was asked about', () => {
    expect(detectPitch(tone(30, { harmonics: 1 }), { sampleRate: RATE, minHz: 70 })).toBeNull()
  })
})

describe('decimate', () => {
  it('brings the rate down by the factor asked for', () => {
    expect(decimate(new Float32Array(1200), 3)).toHaveLength(400)
  })

  it('leaves a signal alone at a factor of one', () => {
    const samples = tone(440)
    expect(decimate(samples, 1)).toBe(samples)
  })

  it('keeps a note findable at a third of the rate', () => {
    const full = tone(146.83, { harmonics: 6, rate: 48000, length: 8192 })
    const reading = detectPitch(decimate(full, 3), { sampleRate: 16000 })
    expect(Math.abs(cents(reading?.frequency ?? 0, 146.83))).toBeLessThan(2)
  })

  it('holds down what would otherwise fold back into the search', () => {
    /* At 48 kHz decimated by three, anything above 8 kHz comes back somewhere
       else in the range unless it is filtered out first. */
    const above = tone(11000, { rate: 48000, length: 8192 })
    expect(rms(decimate(above, 3))).toBeLessThan(rms(above) * 0.15)
  })

  it('leaves a note that belongs in the range alone', () => {
    const inside = tone(220, { rate: 48000, length: 8192 })
    const kept = rms(decimate(inside, 3)) / rms(inside)
    expect(kept).toBeGreaterThan(0.9)
  })
})
