import { useEffect } from 'react'

import { PLACEHOLDER_SONG } from './state/placeholder'
import { useTransport } from './state/transport'
import { useView } from './state/view'
import { HeaderBar, ScrubBar } from './ui/shell'
import { LibraryView } from './ui/views/LibraryView'
import { PlayerView } from './ui/views/PlayerView'
import { SetupView } from './ui/views/SetupView'

export function App() {
  const view = useView((state) => state.view)
  const { setBounds, seek, toggle } = useTransport()

  useEffect(() => {
    setBounds(PLACEHOLDER_SONG.start, PLACEHOLDER_SONG.end)
    seek(PLACEHOLDER_SONG.position)
  }, [seek, setBounds])

  useGlobalSpaceBar(toggle)

  return (
    <div className="app">
      <HeaderBar title={PLACEHOLDER_SONG.title} artist={PLACEHOLDER_SONG.artist} />
      <ScrubBar />
      {view === 'library' ? <LibraryView /> : null}
      {view === 'player' ? <PlayerView /> : null}
      {view === 'setup' ? <SetupView /> : null}
    </div>
  )
}

/** Space toggles playback app-wide, except while typing into a field. */
function useGlobalSpaceBar(toggle: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])
}
