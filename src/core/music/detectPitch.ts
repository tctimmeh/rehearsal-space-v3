/**
 * Finding the pitch of a sound, by the YIN method.
 *
 * The idea is older than the name: a periodic signal looks like itself one
 * period later, so the lag that makes it differ from itself least is the
 * period. What YIN adds is a way of not being fooled into answering an octave
 * too low, which a plain autocorrelation does constantly on anything with a
 * strong second harmonic — a guitar, for instance.
 */

export interface PitchOptions {
  sampleRate: number
  /** Below a guitar's low E, with room for a slack string. */
  minHz?: number
  maxHz?: number
  /**
   * How unlike itself a lag may be and still count as the period. Lower is
   * stricter; above about 0.2 it starts calling noise a note.
   */
  threshold?: number
  /** Quieter than this is not being played, whatever the maths says. */
  floor?: number
}

export interface PitchReading {
  frequency: number
  /** Zero to one. How periodic the window actually was. */
  clarity: number
}

const DEFAULTS = { minHz: 60, maxHz: 1500, threshold: 0.15, floor: 0.004 }

export function rms(samples: Float32Array): number {
  let total = 0
  for (const sample of samples) total += sample * sample
  return Math.sqrt(total / Math.max(1, samples.length))
}

/**
 * Averages neighbouring samples to bring the rate down.
 *
 * Nothing being looked for is above about 1.5 kHz, and the cost of the search
 * grows with the square of the rate, so working at a fraction of it is what
 * makes this affordable at all.
 *
 * The average is weighted and spans twice the step, which costs nothing and
 * rejects far more than a plain block average: what is above the new Nyquist
 * folds back into the range being searched, and a flat average of three
 * samples barely halves it.
 */
export function decimate(samples: Float32Array, factor: number): Float32Array {
  const step = Math.max(1, Math.round(factor))
  if (step === 1) return samples

  const width = step * 2
  const weights = new Float32Array(width)
  let weighed = 0
  for (let index = 0; index < width; index += 1) {
    weights[index] = 1 - Math.abs(index - (width - 1) / 2) / (width / 2)
    weighed += weights[index] as number
  }

  const out = new Float32Array(Math.floor(samples.length / step))
  for (let index = 0; index < out.length; index += 1) {
    let total = 0
    for (let offset = 0; offset < width; offset += 1) {
      total += (samples[Math.min(samples.length - 1, index * step + offset)] as number) *
        (weights[offset] as number)
    }
    out[index] = total / weighed
  }
  return out
}

export function detectPitch(
  samples: Float32Array,
  options: PitchOptions
): PitchReading | null {
  const { sampleRate } = options
  const minHz = options.minHz ?? DEFAULTS.minHz
  const maxHz = options.maxHz ?? DEFAULTS.maxHz
  const threshold = options.threshold ?? DEFAULTS.threshold
  const floor = options.floor ?? DEFAULTS.floor

  if (rms(samples) < floor) return null

  const minLag = Math.max(2, Math.floor(sampleRate / maxHz))
  const maxLag = Math.min(Math.floor(samples.length / 2), Math.ceil(sampleRate / minHz))
  if (maxLag <= minLag) return null

  /* The window each lag is compared over. Every lag uses the same one, or
     longer lags would be judged on less evidence than short ones. */
  const span = samples.length - maxLag

  const difference = new Float32Array(maxLag + 1)
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let total = 0
    for (let index = 0; index < span; index += 1) {
      const delta = (samples[index] as number) - (samples[index + lag] as number)
      total += delta * delta
    }
    difference[lag] = total
  }

  /* Judging each lag against the average of the shorter ones is what stops a
     multiple of the true period looking as good as the period itself. */
  const normalised = new Float32Array(maxLag + 1)
  normalised[0] = 1
  let running = 0
  for (let lag = 1; lag <= maxLag; lag += 1) {
    running += difference[lag] as number
    normalised[lag] = running === 0 ? 1 : ((difference[lag] as number) * lag) / running
  }

  let chosen = -1
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    if ((normalised[lag] as number) >= threshold) continue
    /* Walk to the bottom of this dip rather than stopping at its edge. */
    while (lag + 1 <= maxLag && (normalised[lag + 1] as number) < (normalised[lag] as number)) {
      lag += 1
    }
    chosen = lag
    break
  }

  if (chosen === -1) {
    let best = minLag
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      if ((normalised[lag] as number) < (normalised[best] as number)) best = lag
    }
    /* Nothing was periodic enough to call a note. */
    if ((normalised[best] as number) > 0.5) return null
    chosen = best
  }

  const refined = interpolate(normalised, chosen, maxLag)
  return {
    frequency: sampleRate / refined,
    clarity: Math.max(0, Math.min(1, 1 - (normalised[chosen] as number)))
  }
}

/**
 * The true minimum lies between samples. Fitting a parabola to the dip and
 * taking its lowest point is what turns whole samples into fractions of one,
 * which at these lags is the difference between a few cents and twenty.
 */
function interpolate(values: Float32Array, at: number, maxLag: number): number {
  if (at <= 0 || at >= maxLag) return at
  const before = values[at - 1] as number
  const here = values[at] as number
  const after = values[at + 1] as number
  const divisor = 2 * (2 * here - after - before)
  if (divisor === 0) return at
  return at + (after - before) / divisor
}
