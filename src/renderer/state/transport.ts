import { create } from 'zustand'

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

  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  toggle: () => set({ playing: !get().playing }),
  /* Stopping returns to the earliest point, which may be before 00:00. */
  stop: () => set({ playing: false, position: get().start }),
  seek: (position) =>
    set({ position: Math.min(get().end, Math.max(get().start, position)) }),
  setSpeed: (speed) => set({ speed }),
  setSemitones: (semitones) => set({ semitones }),
  setCents: (cents) => set({ cents }),
  setBounds: (start, end) => set({ start, end })
}))
