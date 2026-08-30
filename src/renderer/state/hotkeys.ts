import {
  actionFor,
  DEFAULT_NUDGE,
  nudgeFor,
  type HotkeyAction,
  type Keystroke
} from '@core/keys/hotkeys'
import { useConfig } from '@renderer/state/config'
import { useDialog } from '@renderer/state/dialog'
import { useMetronome } from '@renderer/state/metronome'
import { useRecording } from '@renderer/state/recording'
import { useTools } from '@renderer/state/tools'
import { useTransport } from '@renderer/state/transport'

/**
 * Something with the cursor is taking the keystroke, so it is not ours.
 *
 * Fields and contenteditables say so themselves. An editor built out of a
 * focusable div — tablature, where the cursor sits on a moment rather than
 * between two characters — has to say so, and does it with `data-typing`.
 * Without that, space plays the song while somebody is writing a bar.
 */
const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null
  if (element?.isContentEditable === true) return true
  if (element?.dataset?.['typing'] === 'true') return true
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
}

/** Brings a tool out before using it: a click nobody can see cannot be stopped. */
const show = (id: 'metronome' | 'tuner'): void => {
  if (!useTools.getState().open[id]) useTools.getState().toggle(id)
}

/**
 * Moves the playhead by however far the modifiers are asking for.
 *
 * The music does not stop, the same way going to the start does not: this is
 * for finding the passage again while it is still running.
 */
const nudge = (stroke: Keystroke, way: 1 | -1): void => {
  const sizes = useConfig.getState().config?.nudge ?? DEFAULT_NUDGE
  const transport = useTransport.getState()
  transport.seek(transport.position + way * nudgeFor(stroke, sizes))
}

const perform: Record<HotkeyAction, (stroke: Keystroke) => void> = {
  playPause: () => useTransport.getState().toggle(),

  nudgeBack: (stroke) => nudge(stroke, -1),
  nudgeForward: (stroke) => nudge(stroke, 1),

  /* Arm, then play — or carry on playing, since arming mid-song starts the
     take there and then rather than waiting for the next press. */
  recordAndPlay: () => {
    const recording = useRecording.getState()
    if (recording.phase === 'off') recording.toggle()
    if (!useTransport.getState().playing) useTransport.getState().play()
  },

  discardTake: () => useRecording.getState().discard(),

  armRecording: () => useRecording.getState().toggle(),

  /* The playhead moves; the music does not stop. Somewhere to go back to
     without breaking off what you are listening to. */
  toStart: () => {
    const transport = useTransport.getState()
    transport.seek(transport.start)
  },

  /*
   * One key for the whole of going round: mark it, go to the top of it, play.
   * Pressed again while it is running, it lets go — which is the only thing
   * left to want by then.
   */
  loop: () => {
    const transport = useTransport.getState()
    if (transport.loop === null) return
    if (transport.playing && transport.looping) {
      transport.setLooping(false)
      return
    }
    transport.seek(transport.loop.start)
    transport.setLooping(true)
    if (!transport.playing) transport.play()
  },

  metronomeRunning: () => {
    show('metronome')
    useMetronome.getState().toggle()
  },

  metronomeTool: () => useTools.getState().toggle('metronome'),
  tunerTool: () => useTools.getState().toggle('tuner'),

  settings: () => useDialog.getState().show('settings')
}

/**
 * Every hotkey, in one place and on one listener.
 *
 * What a keystroke means is decided in core; this only knows what to do about
 * it. They were three near-identical listeners before, each with its own copy
 * of "unless somebody is typing", which is exactly the sort of thing that gets
 * remembered in two of them.
 */
export function followHotkeys(): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    /* Reaching for Shift part-way through a hold arrives as a key of its own,
       and every keyboard event carries what is held down with it — so the
       stride being taken is kept up to date from whatever turns up next. */
    if (held !== null) held.stroke = alsoHolding(held.stroke, event)

    const action = actionFor(event, isTyping(event.target))
    if (action === null) return
    event.preventDefault()
    /* The system's own repeat is not acted on: its rate is somebody's setting
       for typing, and this has a cadence of its own below. */
    if (event.repeat) return
    perform[action](strokeOf(event))
    if (REPEATING.has(action)) hold(action, strokeOf(event))
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (held === null) return
    if (event.key === held.stroke.key) {
      release()
      return
    }
    held.stroke = alsoHolding(held.stroke, event)
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  /* A key held while the window goes away is never let go of, and the playhead
     would run on by itself. */
  window.addEventListener('blur', release)
  return () => {
    release()
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', release)
  }
}

/**
 * Keys that keep going while they are held down.
 *
 * On our own cadence rather than the system's key repeat, which is set for
 * typing and differs from machine to machine — a stride of several seconds at
 * somebody's chosen character rate would cross a song in an eyeblink.
 */
const REPEATING = new Set<HotkeyAction>(['nudgeBack', 'nudgeForward'])

/** Long enough that a single press is a single step, short enough to feel held. */
const BEFORE_REPEATING_MS = 300
const BETWEEN_REPEATS_MS = 150

interface Held {
  action: HotkeyAction
  stroke: Keystroke
  timers: ReturnType<typeof setTimeout>[]
}

let held: Held | null = null

/** The same keystroke, with whatever is being held down alongside it now. */
const alsoHolding = (stroke: Keystroke, event: KeyboardEvent): Keystroke => ({
  ...stroke,
  shiftKey: event.shiftKey,
  ctrlKey: event.ctrlKey,
  metaKey: event.metaKey,
  altKey: event.altKey
})

const strokeOf = (event: KeyboardEvent): Keystroke => ({
  key: event.key,
  code: event.code,
  shiftKey: event.shiftKey,
  ctrlKey: event.ctrlKey,
  metaKey: event.metaKey,
  altKey: event.altKey
})

function hold(action: HotkeyAction, stroke: Keystroke): void {
  release()
  const holding: Held = { action, stroke, timers: [] }
  holding.timers.push(
    setTimeout(() => {
      holding.timers.push(
        setInterval(() => {
          /* Held to the same table as the press was: reaching for Alt turns
             the arrow into something this does not answer for, and letting it
             run on would be answering for it anyway. */
          if (actionFor(holding.stroke) !== action) {
            release()
            return
          }
          perform[action](holding.stroke)
        }, BETWEEN_REPEATS_MS)
      )
    }, BEFORE_REPEATING_MS)
  )
  held = holding
}

function release(): void {
  if (held === null) return
  for (const timer of held.timers) {
    clearTimeout(timer)
    clearInterval(timer)
  }
  held = null
}
