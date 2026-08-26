import {
  NEEDLE_CLARITY_MAX,
  NEEDLE_CLARITY_MIN,
  NEEDLE_GRACE_MAX,
  NEEDLE_GRACE_MIN,
  NEEDLE_READINGS_MAX,
  NEEDLE_READINGS_MIN,
  NEEDLE_SETTLED_MAX,
  NEEDLE_SETTLED_MIN
} from '@shared/config'
import { DEFAULT_NEEDLE, type NeedleSettings } from '@core/music/steady'
import { useConfig } from '@renderer/state/config'
import { Button, Knob, Modal } from '../primitives'

/** Readings arrive twenty a second, which is what turns them into a time. */
const A_SECOND = 20

/**
 * Temporary. The needle trades answering quickly against sitting still, and
 * where that balance belongs is a matter of taste that no amount of measuring
 * settles — so here it is, on knobs, until it has been played at enough to
 * know. Once it is settled these become constants again and this goes.
 */
export function NeedleModal({ onDismiss }: { onDismiss: () => void }) {
  const config = useConfig((state) => state.config)
  const set = useConfig((state) => state.set)

  if (config === null) return null
  const tuner = config.tuner

  const turn = (key: keyof NeedleSettings) => (value: number) =>
    void set({ tuner: { ...tuner, [key]: Number(value.toFixed(3)) } })

  return (
    <Modal
      title="Needle"
      onDismiss={onDismiss}
      footer={
        <>
          <Button onClick={() => void set({ tuner: DEFAULT_NEEDLE })}>Back to standard</Button>
          <Button onClick={onDismiss}>Done</Button>
        </>
      }
    >
      <section className="setting-section">
        <div className="section-head">
          <h4>Answering</h4>
        </div>
        <div className="setting-row">
          <label className="needle__choice">
            <input
              type="checkbox"
              checked={tuner.answerFast}
              onChange={(event) =>
                void set({ tuner: { ...tuner, answerFast: event.target.checked } })
              }
            />
            <span>Answer a string struck from silence straight away</span>
          </label>
        </div>
      </section>

      <section className="setting-section">
        <div className="section-head">
          <h4>Waiting for a pluck to settle</h4>
        </div>
        <div className="setting-row setting-row--knobs">
          <Knob
            label="Wait until"
            value={tuner.settledShare}
            min={NEEDLE_SETTLED_MIN}
            max={NEEDLE_SETTLED_MAX}
            step={0.05}
            defaultValue={DEFAULT_NEEDLE.settledShare}
            onChange={turn('settledShare')}
            format={(value) => (value >= 1 ? 'no wait' : `${Math.round(value * 100)}%`)}
          />
          <Knob
            label="Give up after"
            value={tuner.grace}
            min={NEEDLE_GRACE_MIN}
            max={NEEDLE_GRACE_MAX}
            step={2}
            defaultValue={DEFAULT_NEEDLE.grace}
            onChange={turn('grace')}
            format={(value) => `${(value / A_SECOND).toFixed(1)}s`}
          />
        </div>
      </section>

      <section className="setting-section">
        <div className="section-head">
          <h4>Steadying</h4>
        </div>
        <div className="setting-row setting-row--knobs">
          <Knob
            label="Average"
            value={tuner.readings}
            min={NEEDLE_READINGS_MIN}
            max={NEEDLE_READINGS_MAX}
            step={1}
            defaultValue={DEFAULT_NEEDLE.readings}
            onChange={turn('readings')}
            format={(value) => (value === 1 ? 'none' : `${Math.round((value / A_SECOND) * 1000)}ms`)}
          />
          <Knob
            label="Confidence"
            value={tuner.clarity}
            min={NEEDLE_CLARITY_MIN}
            max={NEEDLE_CLARITY_MAX}
            step={0.01}
            defaultValue={DEFAULT_NEEDLE.clarity}
            onChange={turn('clarity')}
            format={(value) => value.toFixed(2)}
          />
        </div>
      </section>
    </Modal>
  )
}
