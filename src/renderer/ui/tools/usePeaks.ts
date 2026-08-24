import { useEffect, useState } from 'react'

import { decodePeaks } from '@core/peaks/format'
import type { PeakData } from '@core/peaks/peaks'

/** Loads a channel's waveform, and forgets it when the channel changes. */
export function usePeaks(songId: string | undefined, channelId: string | undefined): PeakData | null {
  const [peaks, setPeaks] = useState<PeakData | null>(null)

  useEffect(() => {
    if (songId === undefined || channelId === undefined) {
      setPeaks(null)
      return
    }

    let current = true
    void window.rehearsal.library
      .readPeaks(songId, channelId)
      .then((bytes) => {
        if (current) setPeaks(decodePeaks(bytes))
      })
      .catch(() => {
        if (current) setPeaks(null)
      })

    return () => {
      current = false
    }
  }, [songId, channelId])

  return peaks
}
