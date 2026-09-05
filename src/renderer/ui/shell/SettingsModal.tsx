import { DEFAULT_NUDGE, type NudgeSeconds } from '@core/keys/hotkeys'
import {
  NUDGE_MAX,
  NUDGE_MIN,
  PAN_SPEED_DEFAULT,
  PAN_SPEED_MAX,
  PAN_SPEED_MIN,
  PAN_SPEED_STEP,
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  UI_SCALE_STEP,
  ZOOM_SPEED_DEFAULT,
  ZOOM_SPEED_MAX,
  ZOOM_SPEED_MIN,
  ZOOM_SPEED_STEP
} from '@shared/config'
import { ENGAGED_COLORS, engagedTheme } from '@core/ui/accents'
import { useConfig } from '@renderer/state/config'
import { useSong } from '@renderer/state/song'
import { Button, Knob, Modal } from '../primitives'

const asSeconds = (value: number) => `${Math.round(value)}s`

/** The four strides, in the order the modifiers lengthen them. */
const STRIDES: [keyof NudgeSeconds, string][] = [
  ['plain', 'Plain'],
  ['ctrl', 'Ctrl'],
  ['shift', 'Shift'],
  ['both', 'Ctrl + Shift']
]

/** Everything here is about the app, not about any one song. */
export function SettingsModal({ onDismiss }: { onDismiss: () => void }) {
  const { config, set, chooseLibraryFolder, revealLibraryFolder } = useConfig()
  const { refresh, songs, song, unload } = useSong()

  if (config === null) return null

  /* Knobs work in the same units as the settings do, and both are fractions
     of one, so the rounding is what keeps 0.15000000000000002 out of the file. */
  const turn = (key: 'uiScale' | 'panSpeed' | 'zoomSpeed') => (value: number) =>
    void set({ [key]: Number(value.toFixed(3)) })

  const percent = (value: number) => `${Math.round(value * 100)}%`

  const stride = (key: keyof NudgeSeconds) => (value: number) =>
    void set({ nudge: { ...config.nudge, [key]: Math.round(value) } })

  const pickFolder = async () => {
    const changed = await chooseLibraryFolder()
    if (changed === null) return
    await refresh()
    /* The loaded song may not exist in the new folder. */
    if (song !== null && !useSong.getState().songs.some((entry) => entry.id === song.id)) {
      await unload()
    }
  }

  return (
    <Modal
      title="Settings"
      onDismiss={onDismiss}
      footer={<Button onClick={onDismiss}>Done</Button>}
    >
      <section className="setting-section">
        <div className="section-head">
          <h4>Appearance</h4>
        </div>
        <div className="setting-row">
          <Knob
            label="Size"
            value={config.uiScale}
            min={UI_SCALE_MIN}
            max={UI_SCALE_MAX}
            step={UI_SCALE_STEP}
            defaultValue={UI_SCALE_DEFAULT}
            onChange={turn('uiScale')}
            format={percent}
          />
        </div>
        <div className="setting-row setting-row--tight">
          <span className="setting-label">Button light</span>
          <div className="swatches" role="radiogroup" aria-label="Button light">
            {ENGAGED_COLORS.map(({ id, label, hex }) => {
              const chosen = config.engagedColor === id
              const lit = engagedTheme(hex)
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  aria-label={label}
                  title={label}
                  className="raised swatch"
                  data-engaged={chosen}
                  /* Each one lit with its own colour rather than the chosen
                     one, so the row shows what it is offering. */
                  style={
                    {
                      '--engaged': lit.color,
                      '--engaged-rim': lit.rim,
                      '--engaged-glow': lit.glow
                    } as React.CSSProperties
                  }
                  onClick={() => void set({ engagedColor: id })}
                >
                  <span className="swatch__dot" style={{ background: hex }} />
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="setting-section">
        <div className="section-head">
          <h4>Mouse wheel sensitivity</h4>
        </div>
        <div className="setting-row setting-row--knobs">
          <Knob
            label="Pan"
            value={config.panSpeed}
            min={PAN_SPEED_MIN}
            max={PAN_SPEED_MAX}
            step={PAN_SPEED_STEP}
            defaultValue={PAN_SPEED_DEFAULT}
            onChange={turn('panSpeed')}
            format={percent}
          />
          <Knob
            label="Zoom"
            value={config.zoomSpeed}
            min={ZOOM_SPEED_MIN}
            max={ZOOM_SPEED_MAX}
            step={ZOOM_SPEED_STEP}
            defaultValue={ZOOM_SPEED_DEFAULT}
            onChange={turn('zoomSpeed')}
            format={percent}
          />
        </div>
      </section>

      <section className="setting-section">
        <div className="section-head">
          <h4>Arrow key skip</h4>
        </div>
        <div className="setting-stack">
          <div className="setting-row setting-row--knobs">
            {STRIDES.slice(0, 2).map(([key, label]) => (
              <Knob
                key={key}
                label={label}
                value={config.nudge[key]}
                min={NUDGE_MIN}
                max={NUDGE_MAX}
                step={1}
                defaultValue={DEFAULT_NUDGE[key]}
                onChange={stride(key)}
                format={asSeconds}
              />
            ))}
          </div>
          <div className="setting-row setting-row--knobs">
            {STRIDES.slice(2).map(([key, label]) => (
              <Knob
                key={key}
                label={label}
                value={config.nudge[key]}
                min={NUDGE_MIN}
                max={NUDGE_MAX}
                step={1}
                defaultValue={DEFAULT_NUDGE[key]}
                onChange={stride(key)}
                format={asSeconds}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="setting-section">
        <div className="section-head">
          <h4>Library folder</h4>
          <span className="setting-note">
            {songs.length} {songs.length === 1 ? 'song' : 'songs'}
          </span>
        </div>
        <div className="well setting-path" title={config.libraryPath}>
          {config.libraryPath}
        </div>
        <div className="setting-row">
          <Button onClick={() => void pickFolder()}>Choose…</Button>
          <Button onClick={() => void revealLibraryFolder()}>Open</Button>
        </div>
      </section>
    </Modal>
  )
}
