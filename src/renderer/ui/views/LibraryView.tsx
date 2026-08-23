import { useMemo, useState } from 'react'

import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import { PLACEHOLDER_LIBRARY } from '@renderer/state/placeholder'
import { SubjectIcon } from '../icons/subjectIcons'

type SortKey = 'title' | 'artist'

export function LibraryView() {
  const [sort, setSort] = useState<SortKey>('title')
  const [loadedId, setLoadedId] = useState('a')

  const songs = useMemo(() => {
    const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title)
    return [...PLACEHOLDER_LIBRARY].sort((a, b) =>
      sort === 'title' ? byTitle(a, b) : a.artist.localeCompare(b.artist) || byTitle(a, b)
    )
  }, [sort])

  return (
    <div className="library">
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
      </div>

      <div className="library__rows">
        {songs.map((song) => (
          <button
            key={song.id}
            type="button"
            className="song-row"
            data-loaded={song.id === loadedId}
            style={{ '--loaded-accent': CHANNEL_SUBJECT_COLOR.vocals } as React.CSSProperties}
            onClick={() => setLoadedId(song.id)}
          >
            <span className="col-name">
              <span className="song-row__title">{song.title}</span>
              <div className="song-row__artist">{song.artist || 'No artist'}</div>
            </span>
            <span className="col-channels song-row__channels">
              {song.channels} {song.channels === 1 ? 'channel' : 'channels'}
            </span>
            <span className="col-lyrics song-row__icons">
              {song.lyrics ? <SubjectIcon subject="lyrics" size={16} /> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
