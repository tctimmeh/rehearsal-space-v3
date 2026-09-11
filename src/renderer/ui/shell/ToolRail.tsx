import { TOOL_META, type ToolId } from '@core/tools'
import { toggleTool } from '@renderer/state/toolActions'
import { stageOnShow, useTools } from '@renderer/state/tools'
import { useWaveformEdit } from '@renderer/state/waveformEdit'
import { RAIL_ORDER, TOOL_ICONS } from '../tools/registry'

/**
 * Every tool, always on screen, one click, no menu. Icons only — labels made
 * the buttons wide enough to force a second column, and a rail this short is
 * learned by position.
 */
/**
 * Another stage tool takes the stage from the waveform, and with it whatever is
 * being trimmed or lined up there. That is a thing to be asked about rather
 * than something to discover afterwards, so it goes through the session first.
 */
function choose(id: ToolId): void {
  if (TOOL_META[id].size !== 'stage' || id === 'waveform') {
    toggleTool(id)
    return
  }
  useWaveformEdit.getState().leaving(() => toggleTool(id))
}

export function ToolRail() {
  const open = useTools((state) => state.open)
  /* What is on the stage reads as engaged whether it was chosen or fell there. */
  const onStage = stageOnShow(open)

  return (
    <nav className="rail" aria-label="Tools">
      {RAIL_ORDER.map((entry, index) => {
        if (entry === 'rule') return <span key={`rule-${index}`} className="rail__rule" />
        const { label } = TOOL_META[entry]
        const Glyph = TOOL_ICONS[entry]
        const engaged = open[entry] || entry === onStage
        return (
          <button
            key={entry}
            type="button"
            className="raised rail__btn"
            data-engaged={engaged}
            title={label}
            aria-label={label}
            aria-pressed={engaged}
            onClick={() => choose(entry)}
          >
            <Glyph />
          </button>
        )
      })}
    </nav>
  )
}
