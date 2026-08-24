import { describe, expect, it } from 'vitest'

import { decodePeaks, encodePeaks, UnreadablePeaksError } from './format'
import { PeakBuilder, PEAK_FULL_SCALE, PEAK_LEVEL_COUNT, PEAK_LEVEL_FACTOR } from './peaks'

/** A ramp makes each window's min and max predictable. */
const build = (sampleCount: number, shape: (index: number) => number, samplesPerPeak = 8) => {
  const builder = new PeakBuilder(samplesPerPeak)
  builder.push(Float32Array.from({ length: sampleCount }, (_, index) => shape(index)))
  return builder.finish(44100)
}

describe('PeakBuilder', () => {
  it('records the extremes of each window', () => {
    const { levels } = build(16, (index) => (index < 8 ? 1 : -1))
    const finest = levels[0]?.data

    expect(Array.from(finest ?? [])).toEqual([
      PEAK_FULL_SCALE,
      PEAK_FULL_SCALE,
      -PEAK_FULL_SCALE,
      -PEAK_FULL_SCALE
    ])
  })

  it('does not care how the audio is chunked', () => {
    const whole = new PeakBuilder(8)
    whole.push(Float32Array.from({ length: 64 }, (_, i) => Math.sin(i)))

    const split = new PeakBuilder(8)
    const all = Float32Array.from({ length: 64 }, (_, i) => Math.sin(i))
    split.push(all.subarray(0, 5))
    split.push(all.subarray(5, 33))
    split.push(all.subarray(33))

    expect(split.finish(44100).levels[0]?.data).toEqual(whole.finish(44100).levels[0]?.data)
  })

  it('keeps a trailing partial window, which is still real audio', () => {
    const { levels } = build(12, () => 0.5)
    expect(levels[0]?.data).toHaveLength(4)
  })

  it('builds every zoom level, each four times coarser', () => {
    const { levels } = build(4096, (index) => Math.sin(index / 10))

    expect(levels).toHaveLength(PEAK_LEVEL_COUNT)
    levels.forEach((level, index) => {
      if (index === 0) return
      expect(level.samplesPerPeak).toBe((levels[index - 1]?.samplesPerPeak ?? 0) * PEAK_LEVEL_FACTOR)
    })
  })

  it('folds levels down without losing an extreme', () => {
    /* One lone spike must survive all the way to the coarsest level. */
    const { levels } = build(4096, (index) => (index === 2000 ? 1 : 0))

    for (const level of levels) {
      expect(Math.max(...level.data)).toBe(PEAK_FULL_SCALE)
    }
  })

  it('keeps quiet audio at useful resolution rather than a handful of steps', () => {
    /* A recording peaking at -21dBFS, which a signed byte would flatten to 16
       distinct levels — visible stepping once drawn scaled to fill its height. */
    const { levels } = build(64, (index) => 0.089 * Math.sin(index / 3))
    const distinct = new Set(levels[0]?.data ?? [])
    expect(distinct.size).toBeGreaterThan(8)
    expect(Math.max(...(levels[0]?.data ?? []))).toBeGreaterThan(2000)
  })

  it('clamps rather than wrapping when audio exceeds full scale', () => {
    const { levels } = build(8, () => 4)
    expect(Math.max(...(levels[0]?.data ?? []))).toBe(PEAK_FULL_SCALE)
  })
})

describe('the peak file format', () => {
  it('survives a round trip', () => {
    const original = build(4096, (index) => Math.sin(index / 7))
    const decoded = decodePeaks(encodePeaks(original))

    expect(decoded.sampleRate).toBe(original.sampleRate)
    expect(decoded.levels).toHaveLength(original.levels.length)
    decoded.levels.forEach((level, index) => {
      expect(level.samplesPerPeak).toBe(original.levels[index]?.samplesPerPeak)
      expect(Array.from(level.data)).toEqual(Array.from(original.levels[index]?.data ?? []))
    })
  })

  it('is much smaller than the audio it describes', () => {
    /* Four minutes at 44.1kHz. */
    const builder = new PeakBuilder()
    builder.push(new Float32Array(44100 * 240))
    const bytes = encodePeaks(builder.finish(44100))

    expect(bytes.length).toBeLessThan(300_000)
  })

  it('refuses a file that is not peaks rather than reading nonsense', () => {
    expect(() => decodePeaks(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]))).toThrow(
      UnreadablePeaksError
    )
    expect(() => decodePeaks(new Uint8Array(2))).toThrow(UnreadablePeaksError)
  })

  it('refuses a truncated file', () => {
    const bytes = encodePeaks(build(4096, (index) => Math.sin(index)))
    expect(() => decodePeaks(bytes.slice(0, bytes.length - 10))).toThrow(UnreadablePeaksError)
  })
})
