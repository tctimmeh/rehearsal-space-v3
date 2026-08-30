import { useSong } from '@renderer/state/song'
import { useView } from '@renderer/state/view'

/**
 * Making a song, and going to it.
 *
 * A new song is made in order to work on it, so the two are one act — which
 * is why it is here rather than said twice, once in the library and once in
 * the menu that saves going to the library.
 */
export function useNewSong(): () => Promise<void> {
  const create = useSong((state) => state.create)
  const setView = useView((state) => state.setView)

  return async () => {
    await create()
    setView('player')
  }
}
