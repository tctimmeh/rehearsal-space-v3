import {
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
import { useConfig } from '@renderer/state/config'
import { useSong } from '@renderer/state/song'
import { Button, Knob, Modal } from '../primitives'

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
      size="wide"
      onDismiss={onDismiss}
      footer={<Button onClick={onDismiss}>Done</Button>}
    >
      <section className="setting-section">
        <div className="section-head">
          <h4>Interface size</h4>
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
          <span className="setting-note">Everything scales together</span>
        </div>
      </section>

      <section className="setting-section">
        <div className="section-head">
          <h4>Wheel</h4>
          <span className="setting-note">In the alignment tool</span>
        </div>
        <div className="setting-row">
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
          <span className="setting-note">of the window per notch, holding shift</span>
        </div>
        <div className="setting-row setting-row--tight">
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
          <span className="setting-note">
            {`${Math.round((2 ** config.zoomSpeed - 1) * 100)}% closer or wider per notch`}
          </span>
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
