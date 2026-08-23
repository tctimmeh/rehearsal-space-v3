import { useMemo, useState } from 'react'

import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import type { SongSummary } from '@core/song/song'
import { useSong } from '@renderer/state/song'
import { useView } from '@renderer/state/view'
import { SubjectIcon } from '../icons/subjectIcons'
import { Button, Modal } from '../primitives'

type SortKey = 'title' | 'artist'

export function LibraryView() {
  const { songs, song, create, load, remove } = useSong()
  const setView = useView((state) => state.setView)
  const [sort, setSort] = useState<SortKey>('title')
  const [pendingDelete, setPendingDelete] = useState<SongSummary | null>(null)

  const sorted = useMemo(() => {
    const byTitle = (a: SongSummary, b: SongSummary) => a.title.localeCompare(b.title)
    return [...songs].sort((a, b) =>
      sort === 'title' ? byTitle(a, b) : a.artist.localeCompare(b.artist) || byTitle(a, b)
    )
  }, [songs, sort])

  const openSong = async (id: string) => {
    await load(id)
    setView('player')
  }

  return (
    <div className="library">
      <div className="library__bar">
        <Button variant="primary" onClick={() => void create()}>
          New song
        </Button>
      </div>

      <div className="library__head">
        <span className="col-name library__sorts">
          <button type="button" data-sorted={sort === 'title'} onClick={() => setSort('title')}>
            Song
          </button>
          <button type="button" data-sorted={sort === 'artist'} onClick={() => setSort('artist')}>
            Artist
          </button>
        </span>
        <span className="col-channels">Channels</span>
        <span className="col-lyrics">Has</span>
        <span className="col-actions" />
      </div>

      <div className="library__rows">
        {sorted.length === 0 ? (
          <p className="library__empty">
            The library is empty. Make a song and start filling it in.
          </p>
        ) : (
          sorted.map((summary) => (
            <div
              key={summary.id}
              className="song-row"
              data-loaded={summary.id === song?.id}
              style={{ '--loaded-accent': CHANNEL_SUBJECT_COLOR.vocals } as React.CSSProperties}
            >
              <button
                type="button"
                className="song-row__open"
                onClick={() => void openSong(summary.id)}
              >
                <span className="col-name">
                  <span className="song-row__title">{summary.title}</span>
                  <span className="song-row__artist">{summary.artist || 'No artist'}</span>
                </span>
                <span className="col-channels song-row__channels">
                  {summary.channelCount} {summary.channelCount === 1 ? 'channel' : 'channels'}
                </span>
                <span className="col-lyrics song-row__icons">
                  {summary.hasLyrics ? <SubjectIcon subject="lyrics" size={16} /> : null}
                </span>
              </button>
              <span className="col-actions">
                <Button className="song-row__delete" onClick={() => setPendingDelete(summary)}>
                  Delete
                </Button>
              </span>
            </div>
          ))
        )}
      </div>

      {pendingDelete === null ? null : (
        <Modal
          title={`Delete "${pendingDelete.title}"?`}
          subtitle="This removes the whole song directory: settings, audio and lyrics."
          onDismiss={() => setPendingDelete(null)}
          footer={
            <>
              <Button onClick={() => setPendingDelete(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  void remove(pendingDelete.id)
                  setPendingDelete(null)
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <p className="modal__note">This cannot be undone.</p>
        </Modal>
      )}
    </div>
  )
}
