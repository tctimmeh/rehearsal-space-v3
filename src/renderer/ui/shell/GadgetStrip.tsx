import type { ReactNode } from 'react'

import { useTools } from '@renderer/state/tools'
import { TOOLS, toolsOfSize, type ToolId } from '../tools/registry'

/**
 * Small tools sit in a strip only as tall as they need, and the strip is not
 * there at all when none of them are on.
 */
export function GadgetStrip({ render }: { render: (id: ToolId) => ReactNode }) {
  const open = useTools((state) => state.open)
  const showing = toolsOfSize('gadget').filter((tool) => open[tool.id])
  if (showing.length === 0) return null

  return (
    <div className="gadgets">
      {showing.map((tool) => (
        <div key={tool.id} className="gadget">
          <span className="gadget__name">{TOOLS[tool.id].shortLabel}</span>
          {render(tool.id)}
        </div>
      ))}
      <div className="gadget gadget__spacer" />
    </div>
  )
}
