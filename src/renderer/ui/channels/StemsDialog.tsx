import { useState } from 'react'

import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import { guessSubject } from '@core/song/guessSubject'
import { DEMUCS_MODELS, stemsOf, type DemucsModel } from '@shared/stems'
import { SubjectIcon } from '../icons/subjectIcons'
import { Button, Modal } from '../primitives'

const DEFAULT_MODEL: DemucsModel = 'htdemucs_6s'

interface StemsDialogProps {
  busy: boolean
  onSeparate: (model: DemucsModel, stems: string[], muteSource: boolean) => void
  onDismiss: () => void
}

/** Everything separation is about to do to the song, before it does it. */
export function StemsDialog({ busy, onSeparate, onDismiss }: StemsDialogProps) {
  /* Six stems, all of them: the reason to reach for this is usually to get at
     a part, and it is quicker to untick one than to hunt for the one wanted. */
  const [model, setModel] = useState<DemucsModel>(DEFAULT_MODEL)
  const [chosen, setChosen] = useState<string[]>([...stemsOf(DEFAULT_MODEL)])
  const [muteSource, setMuteSource] = useState(true)

  const pickModel = (next: DemucsModel) => {
    setModel(next)
    /*
     * Everything the chosen model can do, every time it is chosen.
     *
     * Carrying the ticks across looks tidier and is worse: the four-stem model
     * has no guitar or piano, so going there and back left both unticked with
     * nothing on screen saying why.
     */
    setChosen([...stemsOf(next)])
  }

  const toggle = (stem: string) =>
    setChosen((current) =>
      current.includes(stem) ? current.filter((entry) => entry !== stem) : [...current, stem]
    )

  return (
    <Modal
      title="Separate stems"
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
          Mute this channel
        </button>
      </div>
    </Modal>
  )
}
