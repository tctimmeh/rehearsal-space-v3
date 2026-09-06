import { useMemo, useState } from 'react'

import type { SongSummary } from '@core/song/song'
import {
  isFiltered,
  matchesFilter,
  nothingMatches,
  SHOWING_EVERYTHING,
  toggleArtist,
  toggleTag
} from '@core/song/libraryFilter'
import { addTag, knownTags, removeTag } from '@core/song/tags'
import { useNewSong } from '@renderer/state/newSong'
import { useSong } from '@renderer/state/song'
import { useView } from '@renderer/state/view'
import { LyricsEditorIcon, TablatureIcon, WaveformIcon } from '../icons/uiIcons'
import { Button, Modal } from '../primitives'
import { TagInput } from './TagInput'

type SortKey = 'title' | 'artist'

export function LibraryView() {
  const { songs, song, load, remove, tagSong } = useSong()
  const newSong = useNewSong()
  const setView = useView((state) => state.setView)
  const [sort, setSort] = useState<SortKey>('title')
  /* An id, so the dialog cannot show a title that has since changed. */
  const [deletingId, setDeletingId] = useState<string | null>(null)
  /* Which song is having a tag typed into it, and what is being filtered by. */
  const [taggingId, setTaggingId] = useState<string | null>(null)
  const [filter, setFilter] = useState(SHOWING_EVERYTHING)

  const known = useMemo(() => knownTags(songs), [songs])

  const shown = useMemo(() => {
    const byTitle = (a: SongSummary, b: SongSummary) => a.title.localeCompare(b.title)
    return [...songs]
      .filter((entry) => matchesFilter(entry, filter))
      .sort((a, b) =>
        sort === 'title' ? byTitle(a, b) : a.artist.localeCompare(b.artist) || byTitle(a, b)
      )
  }, [songs, sort, filter])

  const askForTag = (tag: string) => setFilter((chosen) => toggleTag(chosen, tag))
  const askForArtist = (artist: string) => setFilter((chosen) => toggleArtist(chosen, artist))

  const deleting = songs.find((entry) => entry.id === deletingId) ?? null

  const openSong = async (id: string) => {
    await load(id)
    setView('player')
  }


  return (
    <div className="library">
      <div className="library__bar">
        {known.length === 0 && !isFiltered(filter) ? null : (
          <div className="library__filter" role="group" aria-label="Filter">
            {known.map((tag) => (
              <button
                key={tag}
                type="button"
                className="raised tag tag--filter"
                data-engaged={filter.tags.some((held) => held === tag)}
                aria-pressed={filter.tags.some((held) => held === tag)}
                onClick={() => askForTag(tag)}
              >
                {tag}
              </button>
            ))}

            {/* Only ever the one, and only while it is being asked for: an
                artist is not a list to choose from, it is a row that was
                clicked, so this is where it went rather than an option. */}
            {filter.artist === null ? null : (
              <button
                type="button"
                className="raised tag tag--filter"
                data-engaged={true}
                aria-pressed={true}
                title={`Stop showing only ${filter.artist}`}
                onClick={() => askForArtist(filter.artist ?? '')}
              >
                {filter.artist}
              </button>
            )}

            {!isFiltered(filter) ? null : (
              <button
                type="button"
                className="library__filter-clear"
                onClick={() => setFilter(SHOWING_EVERYTHING)}
              >
                Show all
              </button>
            )}
          </div>
        )}

        <Button variant="primary" onClick={() => void newSong()}>
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
        <span className="col-holds" />
        <span className="col-tags">Tags</span>
        <span className="col-actions" />
      </div>

      <div className="library__rows">
        {shown.length === 0 ? (
          <p className="library__empty">
            {songs.length === 0
              ? 'The library is empty. Make a song and start filling it in.'
              : nothingMatches(filter)}
          </p>
        ) : (
          shown.map((summary) => (
            <div key={summary.id} className="song-row" data-loaded={summary.id === song?.id}>
              {/* The name opens the song and the artist narrows the list to
                  them; the rest of the row is somewhere to rest a pointer. */}
              <span className="col-name">
                <button
                  type="button"
                  className="song-row__open song-row__title"
                  onClick={() => void openSong(summary.id)}
                >
                  {summary.title}
                </button>
                <span className="song-row__artist">
                  {summary.artist === '' ? (
                    'No artist'
                  ) : (
                    <button
                      type="button"
                      className="song-row__by"
                      title={`Show only songs by ${summary.artist}`}
                      onClick={() => askForArtist(summary.artist)}
                    >
                      {summary.artist}
                    </button>
                  )}
                </span>
              </span>

              <Holds summary={summary} />

              <span className="col-tags song-row__tags">
                {summary.tags.map((tag) => (
                  <span key={tag} className="raised tag">
                    <button
                      type="button"
                      className="tag__name"
                      title={`Show only songs tagged "${tag}"`}
                      onClick={() => askForTag(tag)}
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

/**
 * What is in a song, without opening it.
 *
 * A library of names says nothing about which of them have anything in them
 * yet. What is absent is drawn as well as what is there, faintly, so the row
 * reads as three answers rather than as however many marks happened to fit.
 */
function Holds({ summary }: { summary: SongSummary }) {
  const has = [
    { held: summary.hasAudio, label: 'audio', icon: <WaveformIcon size={14} /> },
    { held: summary.hasLyrics, label: 'lyrics', icon: <LyricsEditorIcon size={14} /> },
    { held: summary.hasTabs, label: 'tablature', icon: <TablatureIcon size={14} /> }
  ]

  return (
    <span className="col-holds song-row__holds">
      {has.map((one) => (
        <span
          key={one.label}
          className="song-row__holds-one"
          data-held={one.held}
          title={`${summary.title} has ${one.held ? '' : 'no '}${one.label}`}
          aria-label={`${one.held ? 'Has' : 'No'} ${one.label}`}
          role="img"
        >
          {one.icon}
        </span>
      ))}
    </span>
  )
}
