import {
  NEEDLE_CLARITY_MAX,
  NEEDLE_CLARITY_MIN,
  NEEDLE_READINGS_MAX,
  NEEDLE_READINGS_MIN
} from '@shared/config'
import { DEFAULT_NEEDLE, type NeedleSettings } from '@core/music/steady'
import { useConfig } from '@renderer/state/config'
import { Button, Knob, Modal } from '../primitives'

/** Readings reach the tuner twenty a second, which is what makes them a time. */
const A_SECOND = 20

/**
 * The settings that are nobody's first business: the workings of a thing
 * rather than a preference about it. Kept apart from Settings so that dialog
 * stays the short one it should be.
 */
export function AdvancedModal({ onDismiss }: { onDismiss: () => void }) {
  const config = useConfig((state) => state.config)
  const set = useConfig((state) => state.set)

  if (config === null) return null
  const tuner = config.tuner

  const turn = (key: keyof NeedleSettings) => (value: number) =>
    void set({ tuner: { ...tuner, [key]: Number(value.toFixed(3)) } })

  return (
    <Modal
      title="Advanced settings"
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
          <h4>Tuner</h4>
        </div>
        <div className="setting-row setting-row--knobs">
          <Knob
            label="Smoothing"
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
