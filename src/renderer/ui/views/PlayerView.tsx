import { TOOL_META, type ToolId } from '@core/tools'
import { useSong } from '@renderer/state/song'
import { describeEdit, useWaveformEdit } from '@renderer/state/waveformEdit'
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
import { WaveformEditPrompt } from '../tools/WaveformEditPrompt'
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
  const drawerTool = openToolOfSize(open, 'drawer')

  /* A session says what it is rather than the tool saying what it is called:
     "Trimming Guitar" is the whole of what is going on. */
  const editing = useWaveformEdit((state) => state.editing)
  const stageTitle =
    stageTool === 'waveform' && editing !== null && song !== null
      ? describeEdit(editing, song.channels)
      : TOOL_META[stageTool].label

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
              <Stage title={stageTitle}>{renderStage(stageTool)}</Stage>
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
      <WaveformEditPrompt />
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
