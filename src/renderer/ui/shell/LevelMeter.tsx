import { useEffect, useRef } from 'react'

import { isClipping, meterFraction } from '@core/audio/level'
import type { InputMonitor } from '@renderer/audio/inputMonitor'

/** How long a moment of clipping stays visible after it has passed. */
const CLIP_HOLD_MS = 1500

/**
 * One channel of what the input is hearing.
 *
 * The bar is moved by writing to the element directly rather than by holding
 * the level in state: it changes on every animation frame, and re-rendering
 * the dialog around it sixty times a second to move one bar would be absurd.
 */
export function LevelMeter({
  monitor,
  channel,
  name,
  recorded
}: {
  monitor: InputMonitor
  channel: number
  name: string
  recorded: boolean
}) {
  const fill = useRef<HTMLDivElement>(null)
  const clip = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let clipUntil = 0
    return monitor.listen((levels) => {
      const level = levels[channel] ?? 0
      if (fill.current !== null) {
        fill.current.style.transform = `scaleX(${meterFraction(level)})`
      }
      if (isClipping(level)) clipUntil = performance.now() + CLIP_HOLD_MS
      if (clip.current !== null) {
        clip.current.dataset['lit'] = performance.now() < clipUntil ? 'true' : 'false'
      }
    })
  }, [monitor, channel])

  return (
    <div className="meter" data-recorded={recorded}>
      <span className="meter__name">{name}</span>
      <div className="well meter__track">
        <div className="meter__fill" ref={fill} />
      </div>
      <span className="meter__clip" ref={clip} data-lit="false" title="Too loud" />
    </div>
  )
}
