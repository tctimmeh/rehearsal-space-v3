import { UI_SCALE_MAX, UI_SCALE_MIN, UI_SCALE_STEP } from '@shared/config'
import { useConfig } from '@renderer/state/config'
import { useSong } from '@renderer/state/song'
import { Button, Modal, Readout } from '../primitives'
import { ToolStatusSection } from './ToolStatusSection'

/** Everything here is about the app, not about any one song. */
export function SettingsModal({ onDismiss }: { onDismiss: () => void }) {
  const { config, setUiScale, chooseLibraryFolder, revealLibraryFolder } = useConfig()
  const { refresh, songs, song, unload } = useSong()

  if (config === null) return null

  const nudgeScale = (delta: number) => {
    const next = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, config.uiScale + delta))
    void setUiScale(Number(next.toFixed(2)))
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
            onClick={() => nudgeScale(-UI_SCALE_STEP)}
            disabled={config.uiScale <= UI_SCALE_MIN}
          >
            Smaller
          </Button>
          <Button
            onClick={() => nudgeScale(UI_SCALE_STEP)}
            disabled={config.uiScale >= UI_SCALE_MAX}
          >
            Bigger
          </Button>
          <span className="setting-note">Everything scales together</span>
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
