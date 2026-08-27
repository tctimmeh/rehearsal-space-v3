import { create } from 'zustand'

import { audioEngine } from '@renderer/audio/engine'
import { useConfig } from '@renderer/state/config'

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
  /**
   * Where the playhead was when playing last began, or null before it ever
   * has. Auto return sends it back here.
   *
   * Scrubbing while playing deliberately leaves this alone: it is where play
   * was engaged, which is the passage being worked on, and jumping the
   * playhead about to hear a different bit does not change what that was.
   */
  playedFrom: number | null
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

/**
 * Auto return: the playhead goes back to where playing began.
 *
 * The point of it is playing a passage over and over — stop, and you are
 * already where you need to be to go again, without hunting for the spot.
 *
 * It happens after the event is announced, so anything acting on the stop —
 * a take being finished, above all — sees the position playing actually
 * reached rather than the one it is about to be sent back to.
 *
 * Only ever on the way out of playing, which is what leaves a way back to the
 * top: stop returns you to the passage, and stop again, from stopped, does
 * what stop has always done and goes to the beginning.
 */
const autoReturn = (get: () => TransportState, wasPlaying: boolean): void => {
  const { playedFrom, seek } = get()
  if (!wasPlaying || playedFrom === null) return
  if (useConfig.getState().config?.autoReturn !== true) return
  seek(playedFrom)
}

export const useTransport = create<TransportState>((set, get) => ({
  playing: false,
  position: 0,
  start: 0,
  playedFrom: null,
  end: 0,
  speed: 1,
  semitones: 0,
  cents: 0,

  play: () => {
    set({ playing: true, playedFrom: get().position })
    /* Announced when sound actually starts, not when it was asked for: a take
       that begins while the engine is still getting ready records the wait. */
    void audioEngine.play().then((started) => {
      if (started) announce('play')
    })
  },
  pause: () => {
    const wasPlaying = get().playing
    audioEngine.pause()
    set({ playing: false, position: audioEngine.position })
    announce('pause')
    autoReturn(get, wasPlaying)
  },
  toggle: () => (get().playing ? get().pause() : get().play()),
  /* Stopping returns to the earliest point, which may be before 00:00. */
  stop: () => {
    const wasPlaying = get().playing
    audioEngine.stop()
    set({ playing: false, position: get().start })
    announce('stop')
    autoReturn(get, wasPlaying)
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
