import { TOOL_META, type ToolId } from '@core/tools'
import { useSong } from '@renderer/state/song'
import { closeTool } from '@renderer/state/toolActions'
import { openToolOfSize, stageOnShow, useTools } from '@renderer/state/tools'
import { useView } from '@renderer/state/view'
import { Drawer, GadgetStrip, MixerDock, Stage, ToolRail } from '../shell'
import { Button } from '../primitives'
import { MetronomeGadget } from '../tools/MetronomeGadget'
import { TunerGadget } from '../tools/TunerGadget'
import { TabEditor } from '../tools/TabEditor'
import { WaveformTool } from '../tools/WaveformTool'
import { LyricsEditor } from '../tools/LyricsEditor'
import { ChordChart } from '../tools/ChordChart'
import { RhymesDrawer } from '../tools/RhymesDrawer'

const renderGadget = (id: ToolId) => {
  switch (id) {
    case 'metronome':
      return <MetronomeGadget />
    case 'tuner':
      return <TunerGadget />
    default:
      return null
  }
}

const renderStage = (id: ToolId) => {
  switch (id) {
    case 'lyrics':
      return <LyricsEditor />
    case 'tab':
      return <TabEditor />
    case 'waveform':
      return <WaveformTool />
    default:
      return null
  }
}

export function PlayerView() {
  const open = useTools((state) => state.open)
  const song = useSong((state) => state.song)

  const stageTool = stageOnShow(open)
  /* Shown because nothing else is, so there is no closing it. */
  const chosen = openToolOfSize(open, 'stage') !== null
  const drawerTool = openToolOfSize(open, 'drawer')

  return (
    <>
      <div className="body">
        <ToolRail />
        <div className="column">
          <GadgetStrip render={renderGadget} />
          <div className="workspace">
            {song === null ? (
              <NoSongLoaded />
            ) : (
              <Stage
                title={TOOL_META[stageTool].label}
                {...(chosen ? { onClose: () => closeTool(stageTool) } : {})}
              >
                {renderStage(stageTool)}
              </Stage>
            )}
            {drawerTool === null ? null : (
              <Drawer title={TOOL_META[drawerTool].label} onClose={() => closeTool(drawerTool)}>
                {drawerTool === 'chords' ? <ChordChart /> : <RhymesDrawer />}
              </Drawer>
            )}
          </div>
        </div>
      </div>

      {song === null ? null : <MixerDock />}
    </>
  )
}

function NoSongLoaded() {
  const setView = useView((state) => state.setView)
  const create = useSong((state) => state.create)

  return (
    <section className="stage">
      <div className="stage__body">
        <div className="stage-empty">
          <div>
            No song loaded.
            <div className="stage-empty__actions">
              <Button onClick={() => setView('library')}>Open the library</Button>
              <Button variant="primary" onClick={() => void create()}>
                New song
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
