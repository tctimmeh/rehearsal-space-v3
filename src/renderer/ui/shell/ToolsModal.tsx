import { useCallback, useEffect, useRef, useState } from 'react'

import {
  isFetchedTool,
  TOOL_SOURCE_NAME,
  type ExternalTool,
  type ToolInstall,
  type ToolStatus
} from '@shared/tools'
import { Button, Modal } from '../primitives'

/**
 * The app runs programs it does not ship. It keeps its own copies of the ones
 * that can be fetched, so that a change elsewhere on the machine cannot take
 * them away — this is where that is shown, where a stale copy can be fetched
 * again, and where a build living somewhere unusual can be pointed at.
 */
export function ToolsModal({ onDismiss }: { onDismiss: () => void }) {
  const [tools, setTools] = useState<ToolStatus[] | null>(null)
  const [installs, setInstalls] = useState<ToolInstall[]>([])
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
    void window.rehearsal.tools.installs().then(setInstalls)
  }, [check])

  /* A fetch started at startup is still going on while this is open, and a
     copy that has just arrived changes what there is to show. */
  const wasFetching = useRef(false)
  useEffect(
    () =>
      window.rehearsal.tools.onInstalls((now) => {
        setInstalls(now)
        const fetching = now.some((one) => one.state === 'fetching')
        if (wasFetching.current && !fetching) void check(true)
        wasFetching.current = fetching
      }),
    [check]
  )

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
  const refetch = (tool: ExternalTool) =>
    isFetchedTool(tool) ? act(() => window.rehearsal.tools.refetch(tool)) : undefined

  return (
    <Modal
      title="External tools"
      subtitle="Programs the app runs but does not ship"
      size="wide"
      onDismiss={onDismiss}
      footer={
        <>
          <span className="modal__foot-aside">
            <Button disabled={busy} onClick={() => void check(true)}>
              {busy ? 'Checking…' : 'Check again'}
            </Button>
          </span>
          <Button onClick={onDismiss}>Done</Button>
        </>
      }
    >
      {error === null ? null : <p className="setting-error">{error}</p>}

      {tools === null ? (
        <p className="tool-placeholder">Looking…</p>
      ) : (
        tools.map((tool) => (
          <ToolRow
            key={tool.name}
            tool={tool}
            install={installs.find((one) => one.tool === tool.name) ?? null}
            busy={busy}
            onChoose={() => void choose(tool.name)}
            onReset={() => void reset(tool.name)}
            onRefetch={() => void refetch(tool.name)}
          />
        ))
      )}
    </Modal>
  )
}

interface RowProps {
  tool: ToolStatus
  install: ToolInstall | null
  busy: boolean
  onChoose: () => void
  onReset: () => void
  onRefetch: () => void
}

const percent = (fraction: number | null): string =>
  fraction === null ? '' : ` ${Math.round(fraction * 100)}%`

function ToolRow({ tool, install, busy, onChoose, onReset, onRefetch }: RowProps) {
  const fetching = install?.state === 'fetching'
  const mine = tool.source === 'private'

  const state = fetching
    ? `Fetching…${percent(install?.progress ?? null)}`
    : tool.path === null
      ? 'Not found'
      : TOOL_SOURCE_NAME[tool.source ?? 'system']

  const detail =
    install?.state === 'failed'
      ? `Could not fetch a copy: ${install.error ?? 'it did not say why'}`
      : tool.path === null
        ? tool.purpose
        : (tool.version ?? tool.path)

  return (
    <div
      className="tool-row"
      data-found={tool.path !== null}
      data-busy={fetching}
      data-failed={install?.state === 'failed'}
    >
      <span className="tool-row__name num">{tool.name}</span>
      <span className="tool-row__detail" title={tool.path ?? tool.purpose}>
        {detail}
      </span>
      <span className="tool-row__state">{state}</span>
      <span className="tool-row__actions">
        {isFetchedTool(tool.name) ? (
          <Button
            disabled={busy || fetching}
            onClick={onRefetch}
            title="Fetch a copy of the app's own, from where it is published"
          >
            {mine ? 'Update' : 'Fetch'}
          </Button>
        ) : null}
        <Button disabled={busy || fetching} onClick={onChoose}>
          Choose…
        </Button>
        <Button
          disabled={busy || fetching || tool.source !== 'chosen'}
          onClick={onReset}
          title="Go back to searching for it"
        >
          Reset
        </Button>
      </span>
    </div>
  )
}
