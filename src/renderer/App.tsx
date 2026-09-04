import { useEffect } from 'react'

import { useConfig } from './state/config'
import { useSong } from './state/song'
import { useToolStatus } from './state/toolStatus'
import { followEngineClock } from './state/transport'
import { followTransportForRecording } from './state/recording'
import { followMetronomeBeats } from './state/metronome'
import { followTuner } from './state/tuner'
import { followSongForLyrics, useLyrics } from './state/lyrics'
import { followSongForTabs, useTabs } from './state/tabs'
import { useView } from './state/view'
import { useJobs } from './state/jobs'
import { DropTarget, HeaderBar, ScrubBar, ToastStack } from './ui/shell'
import { LoadingSong } from './ui/shell/LoadingSong'
import { LibraryView } from './ui/views/LibraryView'
import { PlayerView } from './ui/views/PlayerView'
import { followHotkeys } from './state/hotkeys'

export function App() {
  const view = useView((state) => state.view)
  const songError = useSong((state) => state.error)
  /* Putting a tool in place can fail while nothing but the mixer is on
     screen, and what it has to say is long enough to want the whole width. */
  const toolError = useToolStatus((state) => state.error)
  const trouble =
    songError !== null
      ? { message: songError, dismiss: () => useSong.getState().dismissError() }
      : toolError !== null
        ? { message: toolError, dismiss: () => useToolStatus.getState().dismissError() }
        : null

  useBoot()
  useEffect(() => useJobs.getState().watch(), [])
  useEffect(() => followEngineClock(), [])
  useEffect(() => followTransportForRecording(), [])
  useEffect(() => followMetronomeBeats(), [])
  useEffect(() => followTuner(), [])
  useEffect(() => followSongForLyrics(), [])
  useEffect(() => followSongForTabs(), [])
  useHotkeys()
  useSaveBeforeUnload()

  return (
    <div className="app">
      <HeaderBar />
      <ScrubBar />
      {trouble === null ? null : (
        <ErrorBanner message={trouble.message} onDismiss={trouble.dismiss} />
      )}
      {/* Whichever view is up. A song is often opened from the library and
          the player is not on screen until it has loaded, so an indicator
          living in the player is one nobody waiting for a song ever sees. */}
      <div className="content">
        <LoadingSong />
        {view === 'library' ? <LibraryView /> : null}
        {view === 'player' ? <PlayerView /> : null}
      </div>
      <ToastStack />
      <DropTarget />
    </div>
  )
}

/** Errors are worth reading, quoting, and then getting rid of. */
function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="app__error" role="alert">
      <span>{message}</span>
      <button type="button" className="app__error-dismiss" aria-label="Dismiss" onClick={onDismiss}>
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
        await Promise.all([
          useSong.getState().flush(),
          useLyrics.getState().flush(),
          useTabs.getState().flush()
        ])
      }),
    []
  )
}
