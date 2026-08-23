import { useTools } from '@renderer/state/tools'
import { RAIL_ORDER, TOOLS } from '../tools/registry'

/**
 * Every tool, always on screen, one click, no menu. Icons only — labels made
 * the buttons wide enough to force a second column, and a rail this short is
 * learned by position.
 */
export function ToolRail() {
  const { open, toggle } = useTools()

  return (
    <nav className="rail" aria-label="Tools">
      {RAIL_ORDER.map((entry, index) => {
        if (entry === 'gap') return <span key={`gap-${index}`} className="rail__gap" />
        const tool = TOOLS[entry]
        const Glyph = tool.icon
        return (
          <button
            key={tool.id}
            type="button"
            className="raised rail__btn"
            data-engaged={open[tool.id]}
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={open[tool.id]}
            onClick={() => toggle(tool.id)}
          >
            <Glyph />
          </button>
        )
      })}
    </nav>
  )
}
