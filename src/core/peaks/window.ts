import type { PeakData, PeakLevel } from './peaks'

export interface Column {
  min: number
  max: number
}

/**
 * The coarsest level that still has something to say at this zoom.
 *
 * Reading a finer level than the screen can show is wasted work — several
 * peaks would land on the same pixel — and reading a coarser one loses the
 * transient you were trying to see. So: the finest level whose peaks are no
 * wider than a pixel, falling back to the finest there is when zoomed in
 * beyond what was precomputed.
 */
export function levelFor(data: PeakData, secondsPerPixel: number): PeakLevel | null {
  const [finest] = data.levels
  if (finest === undefined) return null

  const samplesPerPixel = Math.max(1, secondsPerPixel * data.sampleRate)
  let chosen = finest
  for (const level of data.levels) {
    if (level.samplesPerPeak <= samplesPerPixel) chosen = level
  }
  return chosen
}

/**
 * One column per pixel across a window of song time, ready to draw.
 *
 * Times are relative to the audio itself, so a channel that starts partway
 * through the song is the caller's business to offset.
 */
export function columnsFor(
  data: PeakData,
  level: PeakLevel,
  from: number,
  to: number,
  width: number
): Column[] {
  const columns: Column[] = []
  if (width <= 0 || to <= from) return columns

  const secondsPerPeak = level.samplesPerPeak / data.sampleRate
  const peakCount = level.data.length / 2
  const span = to - from

  for (let x = 0; x < width; x += 1) {
    const columnFrom = from + (x / width) * span
    const columnTo = from + ((x + 1) / width) * span

    let first = Math.floor(columnFrom / secondsPerPeak)
    let last = Math.ceil(columnTo / secondsPerPeak) - 1
    /* A column narrower than one peak still has to read that one peak. */
    if (last < first) last = first
    first = Math.max(0, first)
    last = Math.min(peakCount - 1, last)

    if (first > last) {
      columns.push({ min: 0, max: 0 })
      continue
    }

    let min = 1
    let max = -1
    for (let index = first; index <= last; index += 1) {
      min = Math.min(min, (level.data[index * 2] ?? 0) / 32767)
      max = Math.max(max, (level.data[index * 2 + 1] ?? 0) / 32767)
    }
    columns.push({ min, max })
  }

  return columns
}
