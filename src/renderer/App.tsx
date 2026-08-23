import { useEffect } from 'react'

import { useConfig } from './state/config'
import { useSong } from './state/song'
import { useTransport } from './state/transport'
import { useView } from './state/view'
import { HeaderBar, ScrubBar } from './ui/shell'
import { LibraryView } from './ui/views/LibraryView'
import { PlayerView } from './ui/views/PlayerView'
import { SetupView } from './ui/views/SetupView'

export function App() {
  const view = useView((state) => state.view)
  const error = useSong((state) => state.error)

  useBoot()
  useGlobalSpaceBar()
  useSaveBeforeUnload()

  return (
    <div className="app">
      <HeaderBar />
      <ScrubBar />
      {error === null ? null : <p className="app__error">{error}</p>}
      {view === 'library' ? <LibraryView /> : null}
      {view === 'player' ? <PlayerView /> : null}
      {view === 'setup' ? <SetupView /> : null}
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

/** Edits are coalesced, so a pending one has to be written before we go. */
function useSaveBeforeUnload() {
  useEffect(() => window.rehearsal.app.onFlushRequest(() => useSong.getState().flush()), [])
}
