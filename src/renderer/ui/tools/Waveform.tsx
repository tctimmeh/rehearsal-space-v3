import { useEffect, useRef } from 'react'

import type { PeakData } from '@core/peaks/peaks'
import { columnsFor, levelFor } from '@core/peaks/window'

interface WaveformProps {
  peaks: PeakData | null
  /** Song time at the left and right edges. */
  from: number
  to: number
  /** Where the audio itself begins on the song timeline. */
  offset: number
  color: string
  height: number
}

/**
 * Draws the precomputed envelope for a stretch of song time. Nothing here
 * decides anything — which zoom level to read and which peaks fall in which
 * pixel are worked out in core, where they can be tested.
 */
export function Waveform({ peaks, from, to, offset, color, height }: WaveformProps) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (element === null || context === null || context === undefined) return

    const ratio = window.devicePixelRatio || 1
    const width = element.clientWidth
    element.width = Math.max(1, Math.round(width * ratio))
    element.height = Math.max(1, Math.round(height * ratio))
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)

    if (peaks === null || width <= 0) return
    const level = levelFor(peaks, (to - from) / width)
    if (level === null) return

    const columns = columnsFor(peaks, level, from - offset, to - offset, Math.round(width))
    const middle = height / 2
    context.fillStyle = color

    columns.forEach((column, x) => {
      const top = middle - column.max * middle
      const bottom = middle - column.min * middle
      /* Silence still deserves a line, or the waveform appears to stop. */
      context.fillRect(x, top, 1, Math.max(1, bottom - top))
    })
  }, [peaks, from, to, offset, color, height])

  return <canvas ref={canvas} className="waveform" style={{ height }} />
}
