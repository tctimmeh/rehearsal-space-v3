import {
  PAN_SPEED_MAX,
  PAN_SPEED_MIN,
  PAN_SPEED_STEP,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  UI_SCALE_STEP,
  ZOOM_SPEED_MAX,
  ZOOM_SPEED_MIN,
  ZOOM_SPEED_STEP
} from '@shared/config'
import { useConfig } from '@renderer/state/config'
import { useSong } from '@renderer/state/song'
import { Button, Modal, Readout } from '../primitives'
import { ToolStatusSection } from './ToolStatusSection'

/** Everything here is about the app, not about any one song. */
export function SettingsModal({ onDismiss }: { onDismiss: () => void }) {
  const { config, set, chooseLibraryFolder, revealLibraryFolder } = useConfig()
  const { refresh, songs, song, unload } = useSong()

  if (config === null) return null

  const nudge = (
    key: 'uiScale' | 'panSpeed' | 'zoomSpeed',
    delta: number,
    min: number,
    max: number
  ) => {
    const next = Math.min(max, Math.max(min, config[key] + delta))
    void set({ [key]: Number(next.toFixed(3)) })
  }

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
          <Readout>{`${Math.round(config.uiScale * 100)}%`}</Readout>
          <Button
            onClick={() => nudge('uiScale', -UI_SCALE_STEP, UI_SCALE_MIN, UI_SCALE_MAX)}
            disabled={config.uiScale <= UI_SCALE_MIN}
          >
            Smaller
          </Button>
          <Button
            onClick={() => nudge('uiScale', UI_SCALE_STEP, UI_SCALE_MIN, UI_SCALE_MAX)}
            disabled={config.uiScale >= UI_SCALE_MAX}
          >
            Bigger
          </Button>
          <span className="setting-note">Everything scales together</span>
        </div>
      </section>

      <section className="setting-section">
        <div className="section-head">
          <h4>Wheel</h4>
          <span className="setting-note">In the alignment tool</span>
        </div>
        <div className="setting-row">
          <span className="setting-label">Pan</span>
          <Readout>{`${Math.round(config.panSpeed * 100)}%`}</Readout>
          <Button
            onClick={() => nudge('panSpeed', -PAN_SPEED_STEP, PAN_SPEED_MIN, PAN_SPEED_MAX)}
            disabled={config.panSpeed <= PAN_SPEED_MIN}
          >
            Slower
          </Button>
          <Button
            onClick={() => nudge('panSpeed', PAN_SPEED_STEP, PAN_SPEED_MIN, PAN_SPEED_MAX)}
            disabled={config.panSpeed >= PAN_SPEED_MAX}
          >
            Faster
          </Button>
          <span className="setting-note">of the window per notch, holding shift</span>
        </div>
        <div className="setting-row setting-row--tight">
          <span className="setting-label">Zoom</span>
          <Readout>{`${Math.round(config.zoomSpeed * 100)}%`}</Readout>
          <Button
            onClick={() => nudge('zoomSpeed', -ZOOM_SPEED_STEP, ZOOM_SPEED_MIN, ZOOM_SPEED_MAX)}
            disabled={config.zoomSpeed <= ZOOM_SPEED_MIN}
          >
            Slower
          </Button>
          <Button
            onClick={() => nudge('zoomSpeed', ZOOM_SPEED_STEP, ZOOM_SPEED_MIN, ZOOM_SPEED_MAX)}
            disabled={config.zoomSpeed >= ZOOM_SPEED_MAX}
          >
            Faster
          </Button>
          <span className="setting-note">
            {config.zoomSpeed >= 1
              ? 'a step per notch'
              : `${Math.round(1 / config.zoomSpeed)} notches per step`}
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

      <section className="setting-section">
        <ToolStatusSection />
      </section>
    </Modal>
  )
}
