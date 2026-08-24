import type { MetronomeSample } from '@core/song/song'

import chirp from '../assets/clicks/chirp.wav?url'
import cymbal from '../assets/clicks/cymbal.wav?url'
import kit from '../assets/clicks/kit.wav?url'
import rim from '../assets/clicks/rim.wav?url'
import tick from '../assets/clicks/tick.wav?url'

const SOURCES: Record<MetronomeSample, string> = { tick, chirp, cymbal, rim, kit }

/** All five are a few kilobytes, so they are fetched once and kept. */
export async function loadClickSamples(
  context: BaseAudioContext
): Promise<Map<MetronomeSample, AudioBuffer>> {
  const entries = await Promise.all(
    (Object.keys(SOURCES) as MetronomeSample[]).map(async (name) => {
      const response = await fetch(SOURCES[name])
      const decoded = await context.decodeAudioData(await response.arrayBuffer())
      return [name, decoded] as const
    })
  )
  return new Map(entries)
}
