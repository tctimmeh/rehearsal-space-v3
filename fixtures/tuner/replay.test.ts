import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { decimate, detectPitch, rms } from '@core/music/detectPitch'
import { moveNeedle, newNeedle } from '@core/music/steady'

/**
 * The tuner, run against thirty-four recordings of a real guitar: three
 * gestures on five strings, played hard and softly, taken both down a cable
 * and through a microphone in a room, plus tuning a string straight after
 * strumming a chord.
 *
 * This is the check that matters for the tuner, and it is kept out of the
 * ordinary suite because it decodes fourteen megabytes of audio. Run it after
 * touching anything the needle depends on:
 *
 *     npm run test:tuner
 *
 * What it compares against is in `reference.json`, worked out offline with
 * windows four times longer than the tuner's and the luxury of hindsight —
 * see `tools/build-reference.py`. The numbers asserted below are the measured
 * ones with room to breathe; they are here to catch a change that makes the
 * tuner worse, not to pin it to three decimal places.
 */

/* What the renderer does: an 8192-sample window, thinned by three, every 50ms. */
const WINDOW = 8192
const DECIMATION = 3
const LISTEN_MS = 50
const RATE = 44100

const HERE = new URL('.', import.meta.url).pathname
const STRINGS = [82.407, 110.0, 146.832, 195.998, 246.942, 329.628]

interface Recording {
  string: number
  /** Each pluck: when it starts, when the next one does, and where it settles. */
  notes: [number, number, number][]
}

const centsApart = (from: number, to: number) => 1200 * Math.log2(to / from)
const median = (values: number[]) => {
  const sorted = [...values].sort((one, other) => one - other)
  return sorted[Math.floor(sorted.length / 2)] as number
}

function decode(path: string): Float32Array {
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', String(RATE), '-'],
    { maxBuffer: 1 << 28 }
  )
  const samples = new Float32Array(raw.length / 2)
  for (let i = 0; i < samples.length; i++) samples[i] = raw.readInt16LE(i * 2) / 32768
  return samples
}

/** Every 50ms, what the tuner would have been showing. */
function replay(samples: Float32Array): { at: number; hz: number | null }[] {
  const hop = Math.round((RATE * LISTEN_MS) / 1000)
  const heard = new Float32Array(WINDOW)
  let needle = newNeedle()
  const shown: { at: number; hz: number | null }[] = []

  for (let end = WINDOW; end < samples.length; end += hop) {
    heard.set(samples.subarray(end - WINDOW, end))
    const reading = detectPitch(decimate(heard, DECIMATION), { sampleRate: RATE / DECIMATION })
    needle = moveNeedle(needle, {
      frequency: reading?.frequency ?? null,
      clarity: reading?.clarity ?? 0,
      level: rms(heard)
    })
    shown.push({ at: end / RATE, hz: needle.hz })
  }
  return shown
}

const have = existsSync(`${HERE}recordings`) && existsSync(`${HERE}reference.json`)

describe.skipIf(!have)('the tuner, against a real guitar', () => {
  const reference = JSON.parse(readFileSync(`${HERE}reference.json`, 'utf8')) as Record<
    string,
    Recording
  >
  const files = readdirSync(`${HERE}recordings`).filter((name) => name.endsWith('.flac'))

  /* Decoding and replaying every recording takes a few seconds, so it happens
     once and each expectation reads from the result. */
  const off: Record<string, number[]> = { all: [], acoustic: [], attack: [] }
  let sounding = 0
  let live = 0
  const nonsense: string[] = []

  for (const file of files) {
    const name = file.replace('.flac', '')
    const recording = reference[name] as Recording
    const shown = replay(decode(`${HERE}recordings/${file}`))
    const strummed = name.includes('strumming')

    for (const { at, hz } of shown) {
      const note = recording.notes.find(([from, to]) => at >= from + 0.3 && at < to)
      if (note === undefined) continue
      sounding += 1
      if (hz === null) continue
      live += 1

      /* A chord is not one of the six strings, and neither is what a window of
         one reads. Nothing else in these recordings goes near that far out. */
      if (strummed && Math.min(...STRINGS.map((s) => Math.abs(centsApart(s, hz)))) > 35) {
        nonsense.push(`${name} at ${at.toFixed(2)}s`)
      }
      if (strummed) continue

      const apart = Math.abs(centsApart(note[2], hz))
      if (apart > 60) continue /* the string was being wound past another note */
      off['all']?.push(apart)
      if (name.startsWith('acoustic')) off['acoustic']?.push(apart)
      if (at < note[0] + 1.0) off['attack']?.push(apart)
    }
  }

  /* Measured at 0.54 cents; the design this replaced managed 1.9. */
  it('sits within a cent of the pitch each note settles on', () => {
    expect(median(off['all'] as number[])).toBeLessThan(0.7)
  })

  /* 0.68 against 0.44 down a cable — the room is the harder of the two. */
  it('does no worse through a microphone in a room', () => {
    expect(median(off['acoustic'] as number[])).toBeLessThan(0.9)
  })

  /* A plucked string is sharp when struck — ten cents on a low E — and this is
     the wait for it to settle doing its job. */
  it('is not dragged sharp by the second after a pluck', () => {
    expect(median(off['attack'] as number[])).toBeLessThan(1.4)
  })

  it('shows nothing rather than nonsense while a chord rings', () => {
    expect(nonsense).toEqual([])
  })

  /* 94.8%. The rest is the moment after a pluck, waiting for it to settle. */
  it('has something to show almost whenever a string is sounding', () => {
    expect(live / sounding).toBeGreaterThan(0.9)
  })
})
