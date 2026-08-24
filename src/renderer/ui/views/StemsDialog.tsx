import { useState } from 'react'

import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import { guessSubject } from '@core/song/guessSubject'
import type { AudioChannel } from '@core/song/song'
import { DEMUCS_MODELS, stemsOf, type DemucsModel } from '@shared/stems'
import { SubjectIcon } from '../icons/subjectIcons'
import { Button, Modal } from '../primitives'

const DEFAULT_MODEL: DemucsModel = 'htdemucs_6s'

interface StemsDialogProps {
  channel: AudioChannel
  busy: boolean
  onSeparate: (model: DemucsModel, stems: string[], muteSource: boolean) => void
  onDismiss: () => void
}

/** Everything separation is about to do to the song, before it does it. */
export function StemsDialog({ channel, busy, onSeparate, onDismiss }: StemsDialogProps) {
  /* Six stems, all of them: the reason to reach for this is usually to get at
     a part, and it is quicker to untick one than to hunt for the one wanted. */
  const [model, setModel] = useState<DemucsModel>(DEFAULT_MODEL)
  const [chosen, setChosen] = useState<string[]>([...stemsOf(DEFAULT_MODEL)])
  const [muteSource, setMuteSource] = useState(true)

  const pickModel = (next: DemucsModel) => {
    setModel(next)
    /* Keep what still exists in the new model, rather than silently dropping it. */
    setChosen((current) => {
      const available = stemsOf(next)
      const kept = current.filter((stem) => available.includes(stem))
      return kept.length === 0 ? [...available] : kept
    })
  }

  const toggle = (stem: string) =>
    setChosen((current) =>
      current.includes(stem) ? current.filter((entry) => entry !== stem) : [...current, stem]
    )

  return (
    <Modal
      title="Separate stems"
      subtitle={`${channel.name} · adds new channels, keeps the original`}
      onDismiss={onDismiss}
      footer={
        <>
          <Button onClick={onDismiss}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy || chosen.length === 0}
            onClick={() => onSeparate(model, chosen, muteSource)}
          >
            {busy ? 'Separating…' : 'Separate'}
          </Button>
        </>
      }
    >
      <div className="field">
        <label>Model</label>
        <div className="setting-row">
          {DEMUCS_MODELS.map((entry) => (
            <Button
              key={entry.id}
              className="model-choice"
              onClick={() => pickModel(entry.id)}
              {...(model === entry.id ? { 'data-engaged': true } : {})}
            >
              {entry.label}
            </Button>
          ))}
          <span className="setting-note num">{model}</span>
        </div>
      </div>

      <div className="field field--spaced">
        <label>Extract</label>
        <div className="checks">
          {stemsOf(model).map((stem) => {
            const subject = guessSubject(stem)
            return (
              <button
                key={stem}
                type="button"
                className="check"
                data-engaged={chosen.includes(stem)}
                onClick={() => toggle(stem)}
              >
                <span className="check__box" />
                <span style={{ color: CHANNEL_SUBJECT_COLOR[subject] }}>
                  <SubjectIcon subject={subject} size={16} />
                </span>
                {stem}
              </button>
            )
          })}
        </div>
      </div>

      <div className="field field--spaced">
        <button
          type="button"
          className="check"
          data-engaged={muteSource}
          onClick={() => setMuteSource((was) => !was)}
        >
          <span className="check__box" />
          Mute {channel.name} afterwards
        </button>
      </div>
    </Modal>
  )
}
