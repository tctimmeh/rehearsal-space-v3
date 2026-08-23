import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import { PLACEHOLDER_CHANNELS, PLACEHOLDER_SONG } from '@renderer/state/placeholder'
import { SubjectIcon } from '../icons/subjectIcons'
import { Button } from '../primitives'

export function SetupView() {
  return (
    <div className="setup">
      <div className="field-grid">
        <div className="field">
          <label htmlFor="song-title">Title</label>
          <input id="song-title" className="well input" defaultValue={PLACEHOLDER_SONG.title} />
        </div>
        <div className="field">
          <label htmlFor="song-artist">Artist</label>
          <input id="song-artist" className="well input" defaultValue={PLACEHOLDER_SONG.artist} />
        </div>
      </div>

      <div className="section-head">
        <h4>Channels</h4>
        <Button>Add channel</Button>
      </div>

      {PLACEHOLDER_CHANNELS.filter((channel) => channel.kind === 'audio').map((channel) => (
        <div key={channel.id} className="channel-row">
          <span style={{ color: CHANNEL_SUBJECT_COLOR[channel.subject] }}>
            <SubjectIcon subject={channel.subject} />
          </span>
          <span className="channel-row__name">
            {channel.name}
            <span className="channel-row__file">{channel.file}</span>
          </span>
          <span className="channel-row__actions">
            <Button>Stems</Button>
            <Button>Edit</Button>
            <Button>Delete</Button>
          </span>
        </div>
      ))}
    </div>
  )
}
