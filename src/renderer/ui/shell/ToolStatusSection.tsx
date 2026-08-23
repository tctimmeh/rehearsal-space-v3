import { useCallback, useEffect, useState } from 'react'

import type { ToolStatus } from '@shared/tools'
import { Button } from '../primitives'

/**
 * The app runs external tools it does not ship. When one is missing, the
 * feature that needs it simply fails, so the absence is worth stating plainly
 * rather than leaving it to be discovered.
 */
export function ToolStatusSection() {
  const [tools, setTools] = useState<ToolStatus[] | null>(null)
  const [checking, setChecking] = useState(false)

  const check = useCallback(async (refresh: boolean) => {
    setChecking(true)
    try {
      setTools(await window.rehearsal.tools.status(refresh))
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void check(false)
  }, [check])

  return (
    <>
      <div className="section-head">
        <h4>External tools</h4>
        <Button disabled={checking} onClick={() => void check(true)}>
          {checking ? 'Checking…' : 'Check again'}
        </Button>
      </div>

      {tools === null ? (
        <p className="tool-placeholder">Looking…</p>
      ) : (
        tools.map((tool) => (
          <div key={tool.name} className="tool-row" data-found={tool.path !== null}>
            <span className="tool-row__name num">{tool.name}</span>
            <span className="tool-row__detail" title={tool.path ?? undefined}>
              {tool.path === null ? tool.purpose : (tool.version ?? tool.path)}
            </span>
            <span className="tool-row__state">{tool.path === null ? 'Not found' : 'Ready'}</span>
          </div>
        ))
      )}
    </>
  )
}
