import {
  CHANNEL_SUBJECT_COLOR,
  CHANNEL_SUBJECT_LABEL,
  INSTRUMENT_SUBJECTS
} from '@core/song/channelSubject'
import type { Channel } from '@core/song/song'
import { SubjectIcon } from '../icons/subjectIcons'
import { Button, Modal, useSelectOnOpen } from '../primitives'

/** Name and instrument: the two things a wrong guess gets wrong. */
export function ChannelEditor({
  channel,
  onChange,
  onDone
}: {
  channel: Channel
  onChange: (patch: Partial<Channel>) => void
  onDone: () => void
}) {
  const selectName = useSelectOnOpen<HTMLInputElement>()

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
          autoFocus
          ref={selectName}
          onChange={(event) => onChange({ name: event.target.value })}
          /* The name saves as it is typed, so Enter has nothing left to mean
             but done. */
          onKeyDown={(event) => {
            if (event.key === 'Enter') onDone()
          }}
        />
      </div>

      {channel.kind === 'metronome' ? (
        <p className="setting-note setting-note--hint">
          Click tracks are set up in the alignment tool, against the music.
        </p>
      ) : (
        <div className="field field--spaced">
          <label>Instrument</label>
          <div className="subject-grid">
            {INSTRUMENT_SUBJECTS.map((subject) => (
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
      )}
    </Modal>
  )
}
