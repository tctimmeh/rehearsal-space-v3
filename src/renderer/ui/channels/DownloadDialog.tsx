import { useState } from 'react'

import { Button, Modal } from '../primitives'

interface DownloadDialogProps {
  onDownload: (url: string) => void
  onDismiss: () => void
}

export function DownloadDialog({ onDownload, onDismiss }: DownloadDialogProps) {
  const [url, setUrl] = useState('')
  const ready = /^https?:\/\/\S+$/.test(url.trim())

  return (
    <Modal
      title="Download audio"
      subtitle="Fetched with yt-dlp and added as a new channel"
      onDismiss={onDismiss}
      footer={
        <>
          <Button onClick={onDismiss}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => onDownload(url.trim())}
          >
            Download
          </Button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="download-url">Address</label>
        <input
          id="download-url"
          className="well input"
          placeholder="https://…"
          value={url}
          autoFocus
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && ready) onDownload(url.trim())
          }}
        />
      </div>
    </Modal>
  )
}
