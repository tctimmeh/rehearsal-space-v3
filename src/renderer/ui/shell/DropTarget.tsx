import { useEffect, useState } from 'react'

import { useSong } from '@renderer/state/song'

/**
 * Dropping a file anywhere on the window imports it. The overlay only appears
 * once something is actually being dragged over the app.
 */
export function DropTarget() {
  const [over, setOver] = useState(false)
  const song = useSong((state) => state.song)
  const hasSong = song !== null

  useEffect(() => {
    /* Without this, the browser navigates to the dropped file. */
    const onDragOver = (event: DragEvent) => {
      event.preventDefault()
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = hasSong ? 'copy' : 'none'
      if (dragCarriesFiles(event)) setOver(true)
    }

    const onDragLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) setOver(false)
    }

    const onDrop = (event: DragEvent) => {
      event.preventDefault()
      setOver(false)
      if (!hasSong) return
      const paths = [...(event.dataTransfer?.files ?? [])].map((file) =>
        window.rehearsal.pathForFile(file)
      )
      if (paths.length > 0) void useSong.getState().importAudio(paths)
    }

    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [hasSong])

  if (!over) return null

  return (
    <div className="drop-veil">
      <div className="drop-veil__message">
        {hasSong ? 'Drop to import as a new channel' : 'Load a song first'}
      </div>
    </div>
  )
}

const dragCarriesFiles = (event: DragEvent): boolean =>
  [...(event.dataTransfer?.types ?? [])].includes('Files')
