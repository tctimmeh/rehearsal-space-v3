import { describe, expect, it } from 'vitest'

import { PeakBuilder } from './peaks'
import { columnsFor, levelFor } from './window'

/** Two seconds: silence, then a spike one sample wide, then silence. */
const withSpikeAt = (seconds: number, sampleRate = 44100) => {
  const builder = new PeakBuilder()
  const samples = new Float32Array(sampleRate * 2)
  samples[Math.round(seconds * sampleRate)] = 1
  builder.push(samples)
  return builder.finish(sampleRate)
}

describe('levelFor', () => {
  const data = withSpikeAt(1)

  it('reads the finest level when zoomed right in', () => {
    /* A hundredth of a second across a pixel is finer than any level. */
    expect(levelFor(data, 0.0001)?.samplesPerPeak).toBe(data.levels[0]?.samplesPerPeak)
  })

  it('reads a coarser level when zoomed out', () => {
    const coarse = levelFor(data, 1)
    expect(coarse?.samplesPerPeak).toBe(data.levels.at(-1)?.samplesPerPeak)
  })

  it('never picks peaks wider than a pixel while a finer level exists', () => {
    const secondsPerPixel = 0.01
    const level = levelFor(data, secondsPerPixel)
    const finest = data.levels[0]?.samplesPerPeak ?? 0
    if ((level?.samplesPerPeak ?? 0) > finest) {
      expect(level?.samplesPerPeak).toBeLessThanOrEqual(secondsPerPixel * data.sampleRate)
    }
  })

  it('copes with peaks that were never built', () => {
    expect(levelFor({ sampleRate: 44100, levels: [] }, 0.01)).toBeNull()
  })
})

describe('columnsFor', () => {
  const data = withSpikeAt(1)

  it('gives one column per pixel', () => {
    const level = levelFor(data, 2 / 400)
    expect(columnsFor(data, level!, 0, 2, 400)).toHaveLength(400)
  })

  it('finds the transient, and puts it in the right pixel', () => {
    const width = 200
    const level = levelFor(data, 2 / width)
    const columns = columnsFor(data, level!, 0, 2, width)

    const loudest = columns.reduce(
      (best, column, index) => (column.max > (columns[best]?.max ?? 0) ? index : best),
      0
    )
    /* One second into two, drawn across 200 pixels: halfway. */
    expect(loudest).toBeGreaterThanOrEqual(width / 2 - 2)
    expect(loudest).toBeLessThanOrEqual(width / 2 + 2)
  })

  it('keeps the transient visible however far out it is zoomed', () => {
    /* The whole point of a min/max pyramid: a spike must not average away. */
    for (const width of [1000, 200, 40]) {
      const level = levelFor(data, 2 / width)
      const columns = columnsFor(data, level!, 0, 2, width)
      expect(Math.max(...columns.map((column) => column.max))).toBeGreaterThan(0.9)
    }
  })

  it('is silent outside the audio rather than repeating its edges', () => {
    const level = levelFor(data, 4 / 200)
    const columns = columnsFor(data, level!, 2.5, 4, 200)
    expect(Math.max(...columns.map((column) => Math.abs(column.max)))).toBe(0)
  })

  it('returns nothing for a window with no width', () => {
    const level = levelFor(data, 0.01)
    expect(columnsFor(data, level!, 0, 2, 0)).toEqual([])
    expect(columnsFor(data, level!, 1, 1, 100)).toEqual([])
  })
})
