/**
 * A precomputed min/max envelope so a waveform can be drawn without decoding
 * the audio, at several zoom levels so scrolling does not have to resample.
 *
 * Only the finest level reads the audio; each coarser level is folded down
 * from the one before it, which is both faster and exactly equivalent — the
 * minimum of a group of minima is the minimum of the group.
 */
export const PEAK_LEVEL_FACTOR = 4
export const FINEST_SAMPLES_PER_PEAK = 256
export const PEAK_LEVEL_COUNT = 4

export interface PeakLevel {
  samplesPerPeak: number
  /**
   * Interleaved min, max per peak, each in -1..1 quantised to a signed 16-bit
   * value. A byte would give a quiet recording only a handful of distinct
   * levels, and the alignment tool draws waveforms scaled to fill their height,
   * where that stepping would show.
   */
  data: Int16Array
}

export interface PeakData {
  sampleRate: number
  /** Finest first. */
  levels: PeakLevel[]
}

export const levelSizes = (): number[] =>
  Array.from(
    { length: PEAK_LEVEL_COUNT },
    (_, index) => FINEST_SAMPLES_PER_PEAK * PEAK_LEVEL_FACTOR ** index
  )

export const PEAK_FULL_SCALE = 32767

const quantise = (value: number): number =>
  Math.max(-PEAK_FULL_SCALE, Math.min(PEAK_FULL_SCALE, Math.round(value * PEAK_FULL_SCALE)))

/**
 * Accepts audio in whatever chunks it arrives in, so a long file never has to
 * be held in memory at once.
 */
export class PeakBuilder {
  private readonly finest: number[] = []
  private windowMin = Infinity
  private windowMax = -Infinity
  private windowCount = 0

  constructor(private readonly samplesPerPeak = FINEST_SAMPLES_PER_PEAK) {}

  push(samples: Float32Array): void {
    for (const sample of samples) {
      if (sample < this.windowMin) this.windowMin = sample
      if (sample > this.windowMax) this.windowMax = sample
      this.windowCount += 1
      if (this.windowCount === this.samplesPerPeak) this.closeWindow()
    }
  }

  private closeWindow(): void {
    this.finest.push(this.windowMin, this.windowMax)
    this.windowMin = Infinity
    this.windowMax = -Infinity
    this.windowCount = 0
  }

  finish(sampleRate: number): PeakData {
    /* A trailing partial window still describes real audio. */
    if (this.windowCount > 0) this.closeWindow()

    const levels: PeakLevel[] = [
      { samplesPerPeak: this.samplesPerPeak, data: Int16Array.from(this.finest, quantise) }
    ]

    for (let index = 1; index < PEAK_LEVEL_COUNT; index += 1) {
      const finer = levels[index - 1]
      if (finer === undefined) break
      levels.push({
        samplesPerPeak: finer.samplesPerPeak * PEAK_LEVEL_FACTOR,
        data: foldDown(finer.data)
      })
    }

    return { sampleRate, levels }
  }
}

/** Combines each group of `PEAK_LEVEL_FACTOR` peaks into one. */
function foldDown(finer: Int16Array): Int16Array {
  const peaks = finer.length / 2
  const coarserPeaks = Math.ceil(peaks / PEAK_LEVEL_FACTOR)
  const coarser = new Int16Array(coarserPeaks * 2)

  for (let peak = 0; peak < coarserPeaks; peak += 1) {
    let low = PEAK_FULL_SCALE
    let high = -PEAK_FULL_SCALE
    for (let step = 0; step < PEAK_LEVEL_FACTOR; step += 1) {
      const source = (peak * PEAK_LEVEL_FACTOR + step) * 2
      if (source >= finer.length) break
      low = Math.min(low, finer[source] ?? 0)
      high = Math.max(high, finer[source + 1] ?? 0)
    }
    coarser[peak * 2] = low
    coarser[peak * 2 + 1] = high
  }
  return coarser
}
