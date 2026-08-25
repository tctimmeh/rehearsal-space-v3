import { create } from 'zustand'

import { audioEngine } from '@renderer/audio/engine'

/**
 * What the transport just did, for anything that has to act on it.
 *
 * Announced rather than called out to: recording responds to the transport,
 * the transport has no business knowing that recording exists.
 */
export type TransportEvent = 'play' | 'pause' | 'stop'

const listeners = new Set<(event: TransportEvent) => void>()

export function onTransportEvent(listener: (event: TransportEvent) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const announce = (event: TransportEvent): void => {
  for (const listener of [...listeners]) listener(event)
}

export const SPEED_MIN = 0.5
export const SPEED_MAX = 1.5
export const SEMITONES_MIN = -12
export const SEMITONES_MAX = 12
/** Beyond half a semitone the user wants the semitone knob, not this one. */
export const CENTS_MIN = -50
export const CENTS_MAX = 50

interface TransportState {
  playing: boolean
  /** Song time in seconds. Negative during a count-in. */
  position: number
  /** Earliest point on the timeline — negative when a count-in exists. */
  start: number
  end: number
  /** Playback rate as a fraction: 0.96 is the 96% shown on the tempo knob. */
  speed: number
  /** Whole semitones; fine adjustment lives in `cents`. */
  semitones: number
  cents: number

  play: () => void
  pause: () => void
  toggle: () => void
  stop: () => void
  seek: (position: number) => void
  setSpeed: (speed: number) => void
  setSemitones: (semitones: number) => void
  setCents: (cents: number) => void
  setBounds: (start: number, end: number) => void
}

export const useTransport = create<TransportState>((set, get) => ({
  playing: false,
  position: 0,
  start: 0,
  end: 0,
  speed: 1,
  semitones: 0,
  cents: 0,

  play: () => {
    set({ playing: true })
    /* Announced when sound actually starts, not when it was asked for: a take
       that begins while the engine is still getting ready records the wait. */
    void audioEngine.play().then((started) => {
      if (started) announce('play')
    })
  },
  pause: () => {
    audioEngine.pause()
    set({ playing: false, position: audioEngine.position })
    announce('pause')
  },
  toggle: () => (get().playing ? get().pause() : get().play()),
  /* Stopping returns to the earliest point, which may be before 00:00. */
  stop: () => {
    audioEngine.stop()
    set({ playing: false, position: get().start })
    announce('stop')
  },
  seek: (position) => {
    const clamped = Math.min(get().end, Math.max(get().start, position))
    audioEngine.seek(clamped)
    set({ position: clamped })
  },
  setSpeed: (speed) => {
    audioEngine.setSpeed(speed)
    set({ speed })
  },
  setSemitones: (semitones) => {
    audioEngine.setPitch({ semitones, cents: get().cents })
    set({ semitones })
  },
  setCents: (cents) => {
    audioEngine.setPitch({ semitones: get().semitones, cents })
    set({ cents })
  },
  setBounds: (start, end) => {
    audioEngine.setBounds(start, end)
    set({ start, end })
  }
}))

/**
 * The clock lives in the audio engine, derived from the audio hardware's own
 * time. This pulls it into the store for the UI to read. Reaching the end is
 * the engine's business, not a frame's, so it comes through a callback.
 */
export function followEngineClock(): () => void {
  let frame = 0

  /* Running out is the same as being stopped: the playhead goes back to the
     top, which may be before 00:00 when there is a count-in. */
  audioEngine.whenEnded(() => useTransport.getState().stop())

  const tick = (): void => {
    frame = requestAnimationFrame(tick)
    if (!useTransport.getState().playing) return
    const position = audioEngine.position
    /* A take can run past the end of the song, and while it does the song is
       exactly as long as what has been played into it so far. */
    const grown = position > useTransport.getState().end
    useTransport.setState(grown ? { position, end: position } : { position })
  }

  frame = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
}
