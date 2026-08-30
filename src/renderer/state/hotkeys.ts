import {
  actionFor,
  DEFAULT_NUDGE,
  nudgeFor,
  type HotkeyAction,
  type Keystroke
} from '@core/keys/hotkeys'
import { useConfig } from '@renderer/state/config'
import { useDialog } from '@renderer/state/dialog'
import { BPM_MAX, BPM_MIN } from '@core/metronome/pulse'
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

/**
 * Tempo, but only while the metronome is out.
 *
 * These are ordinary characters, and taking them when there is nothing on
 * screen to tune would be taking them for nothing.
 *
 * Read from the config rather than from anything held here: a key held down
 * steps faster than React commits, and a step reckoned from a stale tempo is
 * a step that never happens.
 */
const stepTempo = (delta: number): void => {
  if (!useTools.getState().open.metronome) return
  const bpm = useConfig.getState().config?.metronome.bpm
  if (bpm === undefined) return
  useMetronome.getState().change({ bpm: Math.min(BPM_MAX, Math.max(BPM_MIN, bpm + delta)) })
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

  tempoDown: () => stepTempo(-1),
  tempoUp: () => stepTempo(1),

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
    hold(action, strokeOf(event))
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (held === null) return
    if (sameKey(event, held.stroke)) {
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

/** How a key that keeps going while it is held down paces itself. */
interface Pace {
  /** Long enough that a single press is a single step. */
  first: number
  every: number
  /** Repeats at the plain rate before winding up to the quicker one. */
  after?: number
  then?: number
}

/**
 * Keys that keep going while they are held down, and how fast.
 *
 * On our own cadence rather than the system's key repeat, which is set for
 * typing and differs from machine to machine — a stride of several seconds at
 * somebody's chosen character rate would cross a song in an eyeblink.
 *
 * The playhead moves at one steady rate, because the modifiers are already
 * how you ask it to go faster. Tempo steps by one and has no such thing, so it
 * winds up the way the buttons beside it do: nobody is going to press a key
 * sixty times to get from 100 to 160.
 */
const REPEATING: Partial<Record<HotkeyAction, Pace>> = {
  nudgeBack: { first: 300, every: 150 },
  nudgeForward: { first: 300, every: 150 },
  tempoDown: { first: 420, every: 110, after: 6, then: 45 },
  tempoUp: { first: 420, every: 110, after: 6, then: 45 }
}

interface Held {
  action: HotkeyAction
  stroke: Keystroke
  timer: ReturnType<typeof setTimeout> | null
  fired: number
}

let held: Held | null = null

/**
 * Whether a key going up is the one being held.
 *
 * By where it is on the keyboard rather than what it writes, because what it
 * writes changes: `+` is Shift and `=`, and letting Shift go first turns the
 * key that comes up into a different one from the key that went down.
 */
const sameKey = (event: KeyboardEvent, stroke: Keystroke): boolean =>
  event.code !== '' && stroke.code !== '' ? event.code === stroke.code : event.key === stroke.key

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
  const pace = REPEATING[action]
  /* Another key doing its own job is no reason to stop what is already
     being held, so a key that does not repeat leaves the hold alone. */
  if (pace === undefined) return

  release()
  const holding: Held = { action, stroke, timer: null, fired: 0 }
  const again = (): void => {
    /* Held to the same table as the press was: reaching for Alt turns the key
       into something this does not answer for, and letting it run on would be
       answering for it anyway. */
    if (actionFor(holding.stroke) !== action) {
      release()
      return
    }
    perform[action](holding.stroke)
    holding.fired += 1
    const woundUp = pace.after !== undefined && holding.fired > pace.after
    holding.timer = setTimeout(again, woundUp ? (pace.then ?? pace.every) : pace.every)
  }
  holding.timer = setTimeout(again, pace.first)
  held = holding
}

function release(): void {
  if (held === null) return
  if (held.timer !== null) clearTimeout(held.timer)
  held = null
}
