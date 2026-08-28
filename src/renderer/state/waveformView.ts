import { create } from 'zustand'

/**
 * Where the waveform tool was left, per song.
 *
 * Closing a tool and opening it again should not cost you the place you had
 * found — the zoom especially, which takes a few seconds of scrolling to get
 * back. Kept here rather than on the song because panning writes it on every
 * notch of the wheel, and none of it is worth a file.
 */
export interface WaveformView {
  job: 'loop' | 'click'
  /** Which channel is being looked at, or null for whichever comes first. */
  channelId: string | null
  /** Seconds across the window, or null for the whole song. */
  span: number | null
  /** Song time in the middle of the window, or null to let it settle. */
  centre: number | null
}

const FRESH: WaveformView = { job: 'loop', channelId: null, span: null, centre: null }

interface WaveformViewState {
  views: Record<string, WaveformView>
  remember: (songId: string, patch: Partial<WaveformView>) => void
}

export const useWaveformView = create<WaveformViewState>((set) => ({
  views: {},
  remember: (songId, patch) =>
    set((state) => ({
      views: { ...state.views, [songId]: { ...(state.views[songId] ?? FRESH), ...patch } }
    }))
}))

/** A song not looked at before opens on the whole of itself. */
export const viewOf = (views: Record<string, WaveformView>, songId: string | null): WaveformView =>
  (songId === null ? undefined : views[songId]) ?? FRESH
