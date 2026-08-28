import { TOOL_META } from '@core/tools'
import { toggleTool } from '@renderer/state/toolActions'
import { stageOnShow, useTools } from '@renderer/state/tools'
import { RAIL_ORDER, TOOL_ICONS } from '../tools/registry'

/**
 * Every tool, always on screen, one click, no menu. Icons only — labels made
 * the buttons wide enough to force a second column, and a rail this short is
 * learned by position.
 */
export function ToolRail() {
  const open = useTools((state) => state.open)
  /* What is on the stage reads as engaged whether it was chosen or fell there. */
  const onStage = stageOnShow(open)

  return (
    <nav className="rail" aria-label="Tools">
      {RAIL_ORDER.map((entry, index) => {
        if (entry === 'gap') return <span key={`gap-${index}`} className="rail__gap" />
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
            onClick={() => toggleTool(entry)}
          >
            <Glyph />
          </button>
        )
      })}
    </nav>
  )
}
