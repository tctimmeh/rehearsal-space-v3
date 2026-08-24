import { useState } from 'react'

import { CHANNEL_SUBJECT_COLOR, CHANNEL_SUBJECT_LABEL, CHANNEL_SUBJECTS } from '@core/song/channelSubject'
import type { Channel } from '@core/song/song'
import { formatClock } from '@core/time'
import { useSong } from '@renderer/state/song'
import { SubjectIcon } from '../icons/subjectIcons'
import { Button, Modal } from '../primitives'

export function SetupView() {
  const { song, update, importAudio, removeChannel, importing } = useSong()
  /*
   * Ids, not channels. Holding a copy of the channel would freeze the editor
   * against a song that keeps changing underneath it — its own edits included,
   * so a controlled input would reset on every keystroke.
   */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const byId = (id: string | null) =>
    id === null ? null : (song?.channels.find((channel) => channel.id === id) ?? null)

  if (song === null) {
    return (
      <div className="setup">
        <p className="tool-placeholder">No song loaded.</p>
      </div>
    )
  }

  const editing = byId(editingId)
  const deleting = byId(deletingId)

  return (
    <div className="setup">
      <div className="field-grid">
        <div className="field">
          <label htmlFor="song-title">Title</label>
          <input
            id="song-title"
            className="well input"
            value={song.title}
            onChange={(event) => update({ title: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="song-artist">Artist</label>
          <input
            id="song-artist"
            className="well input"
            value={song.artist}
            placeholder="No artist"
            onChange={(event) => update({ artist: event.target.value })}
          />
        </div>
      </div>

      <div className="section-head">
        <h4>Channels</h4>
        <Button variant="primary" disabled={importing} onClick={() => void importAudio()}>
          {importing ? 'Importing…' : 'Import audio'}
        </Button>
      </div>

      {song.channels.length === 0 ? (
        <p className="tool-placeholder">
          No channels yet. Import a file, or drop one anywhere on the window.
        </p>
      ) : (
        song.channels.map((channel) => (
          <div key={channel.id} className="channel-row">
            <span style={{ color: CHANNEL_SUBJECT_COLOR[channel.subject] }}>
              <SubjectIcon subject={channel.subject} />
            </span>
            <span className="channel-row__name">
              {channel.name}
              <span className="channel-row__file">
                {channel.kind === 'audio'
                  ? `${channel.file} · ${formatClock(channel.duration)}`
                  : 'Metronome'}
              </span>
            </span>
            <span className="channel-row__actions">
              <Button disabled title="Separating stems arrives in M6">
                Stems
              </Button>
              <Button onClick={() => setEditingId(channel.id)}>Edit</Button>
              <Button onClick={() => setDeletingId(channel.id)}>Delete</Button>
            </span>
          </div>
        ))
      )}

      {editing === null ? null : (
        <ChannelEditor
          channel={editing}
          onDone={() => setEditingId(null)}
          onChange={(patch) =>
            update({
              channels: song.channels.map((entry) =>
                entry.id === editing.id ? ({ ...entry, ...patch } as Channel) : entry
              )
            })
          }
        />
      )}

      {deleting === null ? null : (
        <Modal
          title={`Delete "${deleting.name}"?`}
          {...(deleting.kind === 'audio'
            ? { subtitle: 'Its audio and waveform are removed from the song folder.' }
            : {})}
          onDismiss={() => setDeletingId(null)}
          footer={
            <>
              <Button onClick={() => setDeletingId(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  void removeChannel(deleting.id)
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

/** Name and subject are the two things a wrong guess gets wrong. */
function ChannelEditor({
  channel,
  onChange,
  onDone
}: {
  channel: Channel
  onChange: (patch: { name?: string; subject?: Channel['subject'] }) => void
  onDone: () => void
}) {
  return (
    <Modal
      title="Edit channel"
      subtitle={channel.kind === 'audio' ? channel.file : 'Metronome channel'}
      onDismiss={onDone}
      footer={<Button onClick={onDone}>Done</Button>}
    >
      <div className="field">
        <label htmlFor="channel-name">Name</label>
        <input
          id="channel-name"
          className="well input"
          value={channel.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </div>

      <div className="field field--spaced">
        <label>Instrument</label>
        <div className="subject-grid">
          {CHANNEL_SUBJECTS.map((subject) => (
            <button
              key={subject}
              type="button"
              className="raised subject-choice"
              data-engaged={channel.subject === subject}
              title={CHANNEL_SUBJECT_LABEL[subject]}
              onClick={() => onChange({ subject })}
            >
              <span style={{ color: CHANNEL_SUBJECT_COLOR[subject] }}>
                <SubjectIcon subject={subject} size={20} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
