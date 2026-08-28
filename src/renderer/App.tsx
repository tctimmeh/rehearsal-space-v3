import { useEffect } from 'react'

import { useConfig } from './state/config'
import { useSong } from './state/song'
import { followEngineClock } from './state/transport'
import { followTransportForRecording } from './state/recording'
import { followMetronomeBeats } from './state/metronome'
import { followTuner } from './state/tuner'
import { followSongForLyrics, useLyrics } from './state/lyrics'
import { useView } from './state/view'
import { useJobs } from './state/jobs'
import { DropTarget, HeaderBar, ScrubBar, ToastStack } from './ui/shell'
import { LibraryView } from './ui/views/LibraryView'
import { PlayerView } from './ui/views/PlayerView'
import { followHotkeys } from './state/hotkeys'

export function App() {
  const view = useView((state) => state.view)
  const error = useSong((state) => state.error)

  useBoot()
  useEffect(() => useJobs.getState().watch(), [])
  useEffect(() => followEngineClock(), [])
  useEffect(() => followTransportForRecording(), [])
  useEffect(() => followMetronomeBeats(), [])
  useEffect(() => followTuner(), [])
  useEffect(() => followSongForLyrics(), [])
  useHotkeys()
  useSaveBeforeUnload()

  return (
    <div className="app">
      <HeaderBar />
      <ScrubBar />
      {error === null ? null : <ErrorBanner message={error} />}
      {view === 'library' ? <LibraryView /> : null}
      {view === 'player' ? <PlayerView /> : null}
      <ToastStack />
      <DropTarget />
    </div>
  )
}

/** Errors are worth reading, quoting, and then getting rid of. */
function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="app__error" role="alert">
      <span>{message}</span>
      <button
        type="button"
        className="app__error-dismiss"
        aria-label="Dismiss"
        onClick={() => useSong.getState().dismissError()}
      >
        ×
      </button>
    </div>
  )
}

/** Config, then the library, then whichever song was open when we last quit. */
function useBoot() {
  useEffect(() => {
    void (async () => {
      const config = await useConfig.getState().load()
      await useSong.getState().refresh()
      if (config.lastSongId !== null) await useSong.getState().load(config.lastSongId)
    })()
  }, [])
}

/** Every hotkey, on one listener. What each one means is in core. */
function useHotkeys() {
  useEffect(() => followHotkeys(), [])
}

/** Edits are coalesced, so a pending one has to be written before we go. */
function useSaveBeforeUnload() {
  useEffect(
    () =>
      window.rehearsal.app.onFlushRequest(async () => {
        await Promise.all([useSong.getState().flush(), useLyrics.getState().flush()])
      }),
    []
  )
}
