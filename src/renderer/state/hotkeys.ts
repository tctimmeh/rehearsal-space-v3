import { actionFor, type HotkeyAction } from '@core/keys/hotkeys'
import { useMetronome } from '@renderer/state/metronome'
import { useRecording } from '@renderer/state/recording'
import { useTools } from '@renderer/state/tools'
import { useTransport } from '@renderer/state/transport'

/** A field has the cursor, so the keystroke belongs to what is being written. */
const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null
  if (element?.isContentEditable === true) return true
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
}

/** Brings a tool out before using it: a click nobody can see cannot be stopped. */
const show = (id: 'metronome' | 'tuner'): void => {
  if (!useTools.getState().open[id]) useTools.getState().toggle(id)
}

const perform: Record<HotkeyAction, () => void> = {
  playPause: () => useTransport.getState().toggle(),

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
  tunerTool: () => useTools.getState().toggle('tuner')
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
    if (event.repeat) return
    const action = actionFor(event, isTyping(event.target))
    if (action === null) return
    event.preventDefault()
    perform[action]()
  }

  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}
