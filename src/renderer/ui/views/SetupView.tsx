import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import { useSong } from '@renderer/state/song'
import { SubjectIcon } from '../icons/subjectIcons'
import { Button } from '../primitives'
import { ToolStatusSection } from './ToolStatusSection'

export function SetupView() {
  const { song, update } = useSong()

  if (song === null) {
    return (
      <div className="setup">
        <p className="tool-placeholder">No song loaded.</p>
        <ToolStatusSection />
      </div>
    )
  }

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
        <Button disabled>Add channel</Button>
      </div>

      {song.channels.length === 0 ? (
        <p className="tool-placeholder">
          No channels yet. Importing, downloading and recording arrive in M3.
        </p>
      ) : (
        song.channels.map((channel) => (
          <div key={channel.id} className="channel-row">
            <span style={{ color: CHANNEL_SUBJECT_COLOR[channel.subject] }}>
              <SubjectIcon subject={channel.subject} />
            </span>
            <span className="channel-row__name">
              {channel.name}
              {channel.kind === 'audio' ? (
                <span className="channel-row__file">{channel.file}</span>
              ) : null}
            </span>
            <span className="channel-row__actions">
              <Button disabled>Stems</Button>
              <Button disabled>Edit</Button>
              <Button disabled>Delete</Button>
            </span>
          </div>
        ))
      )}

      <ToolStatusSection />
    </div>
  )
}
