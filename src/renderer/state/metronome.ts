import { create } from 'zustand'

import type { Pulse } from '@core/metronome/pulse'
import { collectTap, TAP_TIMEOUT_S, tempoFromTaps } from '@core/metronome/tap'
import { standaloneMetronome } from '@renderer/audio/standaloneMetronome'
import { useConfig } from '@renderer/state/config'
import { useTools } from '@renderer/state/tools'
import type { MetronomeSettings } from '@shared/config'

interface MetronomeState {
  running: boolean
  /** How many taps are in the count being tapped out, for the button to show. */
  tapping: number
  /** Beat now sounding, counting from zero; -1 before the first one. */
  beat: number
  toggle: () => void
  stop: () => void
  change: (patch: Partial<MetronomeSettings>) => void
  /** Takes the tempo from being tapped out. */
  tap: () => void
}

const settings = (): MetronomeSettings =>
  useConfig.getState().config?.metronome ?? {
    bpm: 100,
    beatsPerMeasure: 4,
    accentFirstBeat: true,
    sample: 'beep'
  }

/**
 * The stand-alone metronome as the app sees it.
 *
 * Its settings live in the app config rather than here, so where it was left
 * is where it comes back — including which sound, which is a matter of taste
 * that nobody wants to set twice.
 */
/** The taps being reckoned from. Not state: nothing on screen reads them. */
let taps: number[] = []
let forgetTaps: ReturnType<typeof setTimeout> | null = null

export const useMetronome = create<MetronomeState>((set, get) => ({
  running: false,
  tapping: 0,
  beat: -1,

  toggle: () => {
    if (get().running) {
      get().stop()
      return
    }
    set({ running: true, beat: -1 })
    void standaloneMetronome.start(settings())
  },

  stop: () => {
    standaloneMetronome.stop()
    set({ running: false, beat: -1 })
  },

  tap: () => {
    const at = standaloneMetronome.clock.currentTime
    taps = collectTap(taps, at)
    set({ tapping: taps.length })

    if (forgetTaps !== null) clearTimeout(forgetTaps)
    forgetTaps = setTimeout(() => set({ tapping: 0 }), TAP_TIMEOUT_S * 1000)

    const bpm = tempoFromTaps(taps)
    if (bpm === null) return

    const next = { ...settings(), bpm }
    void useConfig.getState().set({ metronome: next })
    standaloneMetronome.tapTo(next, at)
    if (get().running) set({ beat: 0 })
  },

  change: (patch) => {
    const next = { ...settings(), ...patch }
    void useConfig.getState().set({ metronome: next })
    if (get().running) standaloneMetronome.update(next)
  }
}))

/**
 * Lights the beat when it is heard rather than when it was scheduled. The
 * graph runs ahead of the speakers, so a light driven by the schedule flashes
 * before the click it belongs to.
 */
export function followMetronomeBeats(): () => void {
  const waiting: Pulse[] = []
  let frame = 0

  const drop = standaloneMetronome.listen((pulse) => waiting.push(pulse))

  /* Putting the tool away stops it. A click still going with nothing on screen
     to stop it would be a puzzle rather than a feature. */
  const watchTools = useTools.subscribe((state, previous) => {
    if (previous.open.metronome && !state.open.metronome) useMetronome.getState().stop()
  })

  const tick = (): void => {
    frame = requestAnimationFrame(tick)
    if (waiting.length === 0) return
    const audible = audibleTime()
    let arrived: Pulse | null = null
    while (waiting.length > 0 && (waiting[0] as Pulse).at <= audible) {
      arrived = waiting.shift() as Pulse
    }
    if (arrived !== null) useMetronome.setState({ beat: arrived.index })
  }

  frame = requestAnimationFrame(tick)
  return () => {
    drop()
    watchTools()
    cancelAnimationFrame(frame)
  }
}

function audibleTime(): number {
  const context = standaloneMetronome.clock
  return context.currentTime - (context.outputLatency || context.baseLatency || 0)
}
