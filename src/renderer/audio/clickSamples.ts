import type { MetronomeSample } from '@core/song/song'

import beep from '../assets/clicks/beep.wav?url'
import beepAccent from '../assets/clicks/beep-accent.wav?url'
import block from '../assets/clicks/block.wav?url'
import blockAccent from '../assets/clicks/block-accent.wav?url'
import hat from '../assets/clicks/hat.wav?url'
import hatAccent from '../assets/clicks/hat-accent.wav?url'
import hatOpenAccent from '../assets/clicks/hat-open-accent.wav?url'
import kick from '../assets/clicks/kick.wav?url'
import kickAccent from '../assets/clicks/kick-accent.wav?url'
import kickSnareAccent from '../assets/clicks/kick-snare-accent.wav?url'
import snare from '../assets/clicks/snare.wav?url'
import snareAccent from '../assets/clicks/snare-accent.wav?url'
import sticks from '../assets/clicks/sticks.wav?url'
import sticksAccent from '../assets/clicks/sticks-accent.wav?url'
import woodblock from '../assets/clicks/woodblock.wav?url'
import woodblockAccent from '../assets/clicks/woodblock-accent.wav?url'

/**
 * Every voice is two recordings, not one: an accented beat is a different hit,
 * the way a drummer plays it, rather than the same hit made louder and sharper.
 * The pair is already balanced — the accent sits 4 dB over its own beat, and
 * every beat sits at the same loudness as every other voice's — so playing one
 * is all the scheduler has to do.
 */
export interface ClickPair {
  beat: AudioBuffer
  accent: AudioBuffer
}

/**
 * Two voices share a beat recording with another: open hi-hat is the same
 * closed hat and only its accent opens up, and kick-snare is the same snare
 * with a kick on the downbeat instead of a harder snare.
 */
const SOURCES: Record<MetronomeSample, { beat: string; accent: string }> = {
  beep: { beat: beep, accent: beepAccent },
  block: { beat: block, accent: blockAccent },
  woodblock: { beat: woodblock, accent: woodblockAccent },
  hat: { beat: hat, accent: hatAccent },
  hatOpen: { beat: hat, accent: hatOpenAccent },
  kick: { beat: kick, accent: kickAccent },
  snare: { beat: snare, accent: snareAccent },
  kickSnare: { beat: snare, accent: kickSnareAccent },
  sticks: { beat: sticks, accent: sticksAccent }
}

/** A few hundred kilobytes in all, so they are fetched once and kept. */
export async function loadClickSamples(
  context: BaseAudioContext
): Promise<Map<MetronomeSample, ClickPair>> {
  const decoded = new Map<string, Promise<AudioBuffer>>()
  const load = (url: string): Promise<AudioBuffer> => {
    const already = decoded.get(url)
    if (already !== undefined) return already
    const decoding = fetch(url)
      .then((response) => response.arrayBuffer())
      .then((bytes) => context.decodeAudioData(bytes))
    decoded.set(url, decoding)
    return decoding
  }

  const entries = await Promise.all(
    (Object.keys(SOURCES) as MetronomeSample[]).map(async (name) => {
      const { beat, accent } = SOURCES[name]
      return [name, { beat: await load(beat), accent: await load(accent) }] as const
    })
  )
  return new Map(entries)
}
