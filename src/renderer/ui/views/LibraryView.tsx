import { useMemo, useState } from 'react'

import type { SongSummary } from '@core/song/song'
import { addTag, knownTags, matchesTags, removeTag } from '@core/song/tags'
import { useSong } from '@renderer/state/song'
import { useView } from '@renderer/state/view'
import { Button, Modal } from '../primitives'
import { TagInput } from './TagInput'

type SortKey = 'title' | 'artist'

export function LibraryView() {
  const { songs, song, create, load, remove, tagSong } = useSong()
  const setView = useView((state) => state.setView)
  const [sort, setSort] = useState<SortKey>('title')
  /* An id, so the dialog cannot show a title that has since changed. */
  const [deletingId, setDeletingId] = useState<string | null>(null)
  /* Which song is having a tag typed into it, and what is being filtered by. */
  const [taggingId, setTaggingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<string[]>([])

  const known = useMemo(() => knownTags(songs), [songs])

  const shown = useMemo(() => {
    const byTitle = (a: SongSummary, b: SongSummary) => a.title.localeCompare(b.title)
    return [...songs]
      .filter((entry) => matchesTags(entry.tags, filter))
      .sort((a, b) =>
        sort === 'title' ? byTitle(a, b) : a.artist.localeCompare(b.artist) || byTitle(a, b)
      )
  }, [songs, sort, filter])

  const toggleFilter = (tag: string) =>
    setFilter((chosen) =>
      chosen.includes(tag) ? chosen.filter((held) => held !== tag) : [...chosen, tag]
    )

  const deleting = songs.find((entry) => entry.id === deletingId) ?? null

  const openSong = async (id: string) => {
    await load(id)
    setView('player')
  }

  /* A new song is made in order to work on it, the same as opening one. */
  const newSong = async () => {
    await create()
    setView('player')
  }

  return (
    <div className="library">
      <div className="library__bar">
        <Button variant="primary" onClick={() => void newSong()}>
          New song
        </Button>

        {known.length === 0 ? null : (
          <div className="library__filter" role="group" aria-label="Filter by tag">
            {known.map((tag) => (
              <button
                key={tag}
                type="button"
                className="raised tag tag--filter"
                data-engaged={filter.includes(tag)}
                aria-pressed={filter.includes(tag)}
                onClick={() => toggleFilter(tag)}
              >
                {tag}
              </button>
            ))}
            {filter.length === 0 ? null : (
              <button type="button" className="library__filter-clear" onClick={() => setFilter([])}>
                Show all
              </button>
            )}
          </div>
        )}
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
        <span className="col-tags">Tags</span>
        <span className="col-actions" />
      </div>

      <div className="library__rows">
        {shown.length === 0 ? (
          <p className="library__empty">
            {songs.length === 0
              ? 'The library is empty. Make a song and start filling it in.'
              : 'No song has all of those tags.'}
          </p>
        ) : (
          shown.map((summary) => (
            <div key={summary.id} className="song-row" data-loaded={summary.id === song?.id}>
              <button
                type="button"
                className="song-row__open col-name"
                onClick={() => void openSong(summary.id)}
              >
                <span className="song-row__title">{summary.title}</span>
                <span className="song-row__artist">{summary.artist || 'No artist'}</span>
              </button>

              <span className="col-tags song-row__tags">
                {summary.tags.map((tag) => (
                  <span key={tag} className="raised tag">
                    <button
                      type="button"
                      className="tag__name"
                      title={`Show only songs tagged "${tag}"`}
                      onClick={() => toggleFilter(tag)}
                    >
                      {tag}
                    </button>
                    <button
                      type="button"
                      className="tag__remove"
                      aria-label={`Remove "${tag}" from ${summary.title}`}
                      onClick={() => void tagSong(summary.id, removeTag(summary.tags, tag))}
                    >
                      ×
                    </button>
                  </span>
                ))}

                {taggingId === summary.id ? (
                  <TagInput
                    known={known}
                    alreadyOn={summary.tags}
                    onAdd={(tag) => void tagSong(summary.id, addTag(summary.tags, tag))}
                    onDone={() => setTaggingId(null)}
                  />
                ) : (
                  <button
                    type="button"
                    className="raised tag tag--add"
                    aria-label={`Add a tag to ${summary.title}`}
                    onClick={() => setTaggingId(summary.id)}
                  >
                    +
                  </button>
                )}
              </span>

              <span className="col-actions">
                <Button className="song-row__delete" onClick={() => setDeletingId(summary.id)}>
                  Delete
                </Button>
              </span>
            </div>
          ))
        )}
      </div>

      {deleting === null ? null : (
        <Modal
          title={`Delete "${deleting.title}"?`}
          subtitle="This removes the whole song directory: settings, audio and lyrics."
          onDismiss={() => setDeletingId(null)}
          footer={
            <>
              <Button onClick={() => setDeletingId(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  void remove(deleting.id)
                  setDeletingId(null)
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
