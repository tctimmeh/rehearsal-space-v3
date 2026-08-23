import { useState } from 'react'

import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import { PLACEHOLDER_CHANNELS, type PlaceholderChannel } from '@renderer/state/placeholder'
import { openDrawerTool, openStageTool, useTools } from '@renderer/state/tools'
import {
  Drawer,
  GadgetStrip,
  MixerDock,
  Stage,
  StageEmpty,
  ToolRail,
  type BusState
} from '../shell'
import { TOOLS, type ToolId } from '../tools/registry'
import { MetronomeGadget } from '../tools/MetronomeGadget'
import { TunerGadget } from '../tools/TunerGadget'
import {
  AlignPlaceholder,
  ChordChartPlaceholder,
  LyricsEditorPlaceholder,
  RhymesPlaceholder
} from '../tools/StagePlaceholders'

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
      return <LyricsEditorPlaceholder />
    case 'chords':
      return <ChordChartPlaceholder />
    case 'align':
      return <AlignPlaceholder />
    default:
      return null
  }
}

export function PlayerView() {
  const { open, close } = useTools()
  const [channels, setChannels] = useState<PlaceholderChannel[]>(PLACEHOLDER_CHANNELS)
  const [buses, setBuses] = useState<BusState[]>([
    { id: 'music', label: 'Music', gain: 0.84, color: CHANNEL_SUBJECT_COLOR.music },
    { id: 'click', label: 'Click', gain: 0.5, color: CHANNEL_SUBJECT_COLOR.metronome }
  ])

  const stageTool = openStageTool(open)
  const drawerTool = openDrawerTool(open)

  return (
    <>
      <div className="body">
        <ToolRail />
        <div className="column">
          <GadgetStrip render={renderGadget} />
          <div className="workspace">
            {stageTool === null ? (
              <StageEmpty />
            ) : (
              <Stage title={TOOLS[stageTool].label} onClose={() => close(stageTool)}>
                {renderStage(stageTool)}
              </Stage>
            )}
            {drawerTool === null ? null : (
              <Drawer title={TOOLS[drawerTool].label} onClose={() => close(drawerTool)}>
                <RhymesPlaceholder />
              </Drawer>
            )}
          </div>
        </div>
      </div>

      <MixerDock
        channels={channels}
        buses={buses}
        onChannelChange={(id, patch) =>
          setChannels((current) =>
            current.map((channel) => (channel.id === id ? { ...channel, ...patch } : channel))
          )
        }
        onBusChange={(id, gain) =>
          setBuses((current) => current.map((bus) => (bus.id === id ? { ...bus, gain } : bus)))
        }
      />
    </>
  )
}
