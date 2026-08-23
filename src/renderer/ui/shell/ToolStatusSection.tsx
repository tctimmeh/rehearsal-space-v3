import { useCallback, useEffect, useState } from 'react'

import type { ExternalTool, ToolStatus } from '@shared/tools'
import { Button } from '../primitives'

/**
 * The app runs external tools it does not ship. When one is missing, the
 * feature that needs it simply fails, so the absence is worth stating plainly
 * rather than leaving it to be discovered — and pointing the app at a build
 * that lives somewhere unusual has to be possible.
 */
export function ToolStatusSection() {
  const [tools, setTools] = useState<ToolStatus[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async (refresh: boolean) => {
    setBusy(true)
    try {
      setTools(await window.rehearsal.tools.status(refresh))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void check(false)
  }, [check])

  const act = async (run: () => Promise<ToolStatus[] | null>) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await run()
      if (updated !== null) setTools(updated)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  const choose = (tool: ExternalTool) => act(() => window.rehearsal.tools.choose(tool))
  const reset = (tool: ExternalTool) => act(() => window.rehearsal.tools.clear(tool))

  return (
    <>
      <div className="section-head">
        <h4>External tools</h4>
        <Button disabled={busy} onClick={() => void check(true)}>
          {busy ? 'Checking…' : 'Check again'}
        </Button>
      </div>

      {error === null ? null : <p className="setting-error">{error}</p>}

      {tools === null ? (
        <p className="tool-placeholder">Looking…</p>
      ) : (
        tools.map((tool) => (
          <div key={tool.name} className="tool-row" data-found={tool.path !== null}>
            <span className="tool-row__name num">{tool.name}</span>
            <span className="tool-row__detail" title={tool.path ?? tool.purpose}>
              {tool.path === null ? tool.purpose : (tool.version ?? tool.path)}
            </span>
            <span className="tool-row__state">
              {tool.path === null ? 'Not found' : tool.custom ? 'Set by you' : 'Ready'}
            </span>
            <span className="tool-row__actions">
              <Button disabled={busy} onClick={() => void choose(tool.name)}>
                Choose…
              </Button>
              <Button
                disabled={busy || !tool.custom}
                onClick={() => void reset(tool.name)}
                title="Go back to searching for it"
              >
                Reset
              </Button>
            </span>
          </div>
        ))
      )}
    </>
  )
}
