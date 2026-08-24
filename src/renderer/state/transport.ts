import { create } from 'zustand'

import { audioEngine } from '@renderer/audio/engine'

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
    void audioEngine.play()
    set({ playing: true })
  },
  pause: () => {
    audioEngine.pause()
    set({ playing: false, position: audioEngine.position })
  },
  toggle: () => (get().playing ? get().pause() : get().play()),
  /* Stopping returns to the earliest point, which may be before 00:00. */
  stop: () => {
    audioEngine.stop()
    set({ playing: false, position: get().start })
  },
  seek: (position) => {
    const clamped = Math.min(get().end, Math.max(get().start, position))
    audioEngine.seek(clamped)
    set({ position: clamped })
  },
  setSpeed: (speed) => set({ speed }),
  setSemitones: (semitones) => set({ semitones }),
  setCents: (cents) => set({ cents }),
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

  audioEngine.whenEnded(() => useTransport.getState().pause())

  const tick = (): void => {
    frame = requestAnimationFrame(tick)
    if (!useTransport.getState().playing) return
    useTransport.setState({ position: audioEngine.position })
  }

  frame = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
}
