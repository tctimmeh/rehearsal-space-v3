import { useEffect } from 'react'

import { useConfig } from './state/config'
import { useSong } from './state/song'
import { followEngineClock, useTransport } from './state/transport'
import { followTransportForRecording } from './state/recording'
import { followMetronomeBeats, useMetronome } from './state/metronome'
import { followTuner } from './state/tuner'
import { followSongForLyrics, useLyrics } from './state/lyrics'
import { useTools } from './state/tools'
import { useView } from './state/view'
import { useJobs } from './state/jobs'
import { DropTarget, HeaderBar, ScrubBar, ToastStack } from './ui/shell'
import { LibraryView } from './ui/views/LibraryView'
import { PlayerView } from './ui/views/PlayerView'

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
  useGlobalSpaceBar()
  useMetronomeHotkey()
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

/** Space toggles playback app-wide, except while typing into a field. */
function useGlobalSpaceBar() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      event.preventDefault()
      useTransport.getState().toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

/**
 * Tilde starts and stops the stand-alone metronome from anywhere, and brings
 * it out if it was put away — starting a click nobody can see would leave no
 * way to stop it but the same key again.
 */
function useMetronomeHotkey() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '`' && event.key !== '~') return
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      event.preventDefault()
      if (!useTools.getState().open.metronome) useTools.getState().toggle('metronome')
      useMetronome.getState().toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
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
