import { UI_SCALE_MAX, UI_SCALE_MIN, UI_SCALE_STEP } from '@shared/config'
import { useConfig } from '@renderer/state/config'
import { useSong } from '@renderer/state/song'
import { Button, Modal, Readout } from '../primitives'

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
    if (song !== null && !useSong.getState().songs.some((entry) => entry.id === song.id)) await unload()
  }

  return (
    <Modal
      title="Settings"
      onDismiss={onDismiss}
      footer={<Button onClick={onDismiss}>Done</Button>}
    >
      <div className="field">
        <label htmlFor="ui-scale">Interface size</label>
        <div className="setting-row">
          <Readout>{`${Math.round(config.uiScale * 100)}%`}</Readout>
          <Button
            id="ui-scale"
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
        </div>
      </div>

      <div className="field setting-block">
        <label>Library folder</label>
        <div className="well setting-path" title={config.libraryPath}>
          {config.libraryPath}
        </div>
        <div className="setting-row">
          <Button onClick={() => void pickFolder()}>Choose…</Button>
          <Button onClick={() => void revealLibraryFolder()}>Open</Button>
          <span className="setting-note">
            {songs.length} {songs.length === 1 ? 'song' : 'songs'}
          </span>
        </div>
      </div>
    </Modal>
  )
}
