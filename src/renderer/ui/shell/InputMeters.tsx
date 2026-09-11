import { useEffect, useRef } from 'react'

import { ALL_INPUTS, channelName, type InputChoice } from '@core/audio/inputChannels'
import { isClipping, meterFraction } from '@core/audio/level'
import { useConfig } from '@renderer/state/config'
import { useRecording } from '@renderer/state/recording'
import { useSong } from '@renderer/state/song'

/** How long a moment of clipping stays visible after it has passed. */
const CLIP_HOLD_MS = 1500

/** Two sockets is what the interfaces this is for have. */
const SHOWN = 2

/** Whether what this socket hears is going to end up in the take. */
const recorded = (channel: number, choice: InputChoice): boolean =>
  choice === ALL_INPUTS || choice === channel + 1

/**
 * What the input is hearing, beside the button that will record it.
 *
 * Set a level before playing rather than after: a take that turns out to have
 * been clipping, or to have been of nothing at all, is a take played again. The
 * dialog has meters too, but it has to be opened to be looked at, and the
 * moment they matter is the moment before you start.
 *
 * They are live only while something is armed — nothing is arriving otherwise —
 * and the socket that will not be kept is drawn as the quiet thing it is.
 * Pressing them opens the dialog, which is where the choosing is done.
 */
export function InputMeters({ onOpen }: { onOpen: () => void }) {
  const phase = useRecording((state) => state.phase)
  const choice = useConfig((state) => state.config?.inputChannel ?? ALL_INPUTS)
  const armed = phase !== 'off'

  return (
    <button
      type="button"
      className="raised meters-strip"
      data-armed={armed}
      title={armed ? 'What the input is hearing' : 'Choose what to record from'}
      aria-label="Input levels"
      onClick={onOpen}
    >
      {Array.from({ length: SHOWN }, (_, channel) => (
        <InputMeter
          key={channel}
          channel={channel}
          armed={armed}
          recorded={recorded(channel, choice)}
        />
      ))}
    </button>
  )
}

/**
 * One socket.
 *
 * The bar is moved by writing to the element rather than by holding the level
 * in state: it changes on every animation frame, and re-rendering the header
 * sixty times a second to move two bars would be absurd.
 */
function InputMeter({
  channel,
  armed,
  recorded: kept
}: {
  channel: number
  armed: boolean
  recorded: boolean
}) {
  const fill = useRef<HTMLSpanElement>(null)
  const listenToInput = useSong((state) => state.listenToInput)

  useEffect(() => {
    const flat = () => {
      if (fill.current !== null) {
        fill.current.style.transform = 'scaleY(0)'
        fill.current.dataset['clipping'] = 'false'
      }
    }
    if (!armed) {
      flat()
      return
    }

    let clipUntil = 0
    const stop = listenToInput((levels) => {
      const level = levels[channel] ?? 0
      if (fill.current === null) return
      fill.current.style.transform = `scaleY(${meterFraction(level)})`
      if (isClipping(level)) clipUntil = performance.now() + CLIP_HOLD_MS
      fill.current.dataset['clipping'] = performance.now() < clipUntil ? 'true' : 'false'
    })
    return () => {
      stop()
      flat()
    }
  }, [armed, channel, listenToInput])

  return (
    <span
      className="meters-strip__track"
      data-recorded={kept}
      title={channelName(channel, SHOWN)}
    >
      <span className="meters-strip__fill" ref={fill} data-clipping="false" />
    </span>
  )
}
