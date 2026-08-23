import { create } from 'zustand'

export const SPEED_MIN = 0.5
export const SPEED_MAX = 1.5
export const PITCH_MIN = -12
export const PITCH_MAX = 12

interface TransportState {
  playing: boolean
  /** Song time in seconds. Negative during a count-in. */
  position: number
  /** Earliest point on the timeline — negative when a count-in exists. */
  start: number
  end: number
  /** Playback rate as a fraction: 0.96 is the 96% shown on the tempo knob. */
  speed: number
  /** Pitch offset in semitones; fractional values are cents. */
  pitch: number

  play: () => void
  pause: () => void
  toggle: () => void
  stop: () => void
  seek: (position: number) => void
  setSpeed: (speed: number) => void
  setPitch: (pitch: number) => void
  setBounds: (start: number, end: number) => void
}

export const useTransport = create<TransportState>((set, get) => ({
  playing: false,
  position: 0,
  start: 0,
  end: 0,
  speed: 1,
  pitch: 0,

  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  toggle: () => set({ playing: !get().playing }),
  /* Stopping returns to the earliest point, which may be before 00:00. */
  stop: () => set({ playing: false, position: get().start }),
  seek: (position) =>
    set({ position: Math.min(get().end, Math.max(get().start, position)) }),
  setSpeed: (speed) => set({ speed }),
  setPitch: (pitch) => set({ pitch }),
  setBounds: (start, end) => set({ start, end })
}))
