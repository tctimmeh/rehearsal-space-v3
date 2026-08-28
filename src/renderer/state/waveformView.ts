import { create } from 'zustand'

/**
 * How far into the song the waveform tool is zoomed, and where.
 *
 * Worth remembering while the app is open, because a zoom takes a few seconds
 * of scrolling to find again — and not worth a file, because panning would
 * write one on every notch of the wheel. Which tab and which channel *are*
 * worth a file, and live on the song.
 */
export interface WaveformWindow {
  /** Seconds across the window, or null for the whole song. */
  span: number | null
  /** Song time in the middle of it, or null to let it settle. */
  centre: number | null
}

const WHOLE_SONG: WaveformWindow = { span: null, centre: null }

interface WaveformViewState {
  windows: Record<string, WaveformWindow>
  remember: (songId: string, patch: Partial<WaveformWindow>) => void
}

export const useWaveformView = create<WaveformViewState>((set) => ({
  windows: {},
  remember: (songId, patch) =>
    set((state) => ({
      windows: {
        ...state.windows,
        [songId]: { ...(state.windows[songId] ?? WHOLE_SONG), ...patch }
      }
    }))
}))

/** A song not looked at this session opens on the whole of itself. */
export const windowOf = (
  windows: Record<string, WaveformWindow>,
  songId: string | null
): WaveformWindow => (songId === null ? undefined : windows[songId]) ?? WHOLE_SONG
