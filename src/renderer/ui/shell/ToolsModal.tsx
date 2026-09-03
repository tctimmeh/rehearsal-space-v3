import { useEffect } from 'react'

import {
  DEMUCS_DOWNLOAD,
  isProvidedTool,
  isRemovableTool,
  TOOL_SOURCE_NAME,
  type ExternalTool,
  type ToolInstall,
  type ToolStatus
} from '@shared/tools'
import { useToolStatus } from '@renderer/state/toolStatus'
import { Button, Modal } from '../primitives'

/**
 * The app runs programs it does not ship. It keeps its own copies of the ones
 * that can be fetched, so that a change elsewhere on the machine cannot take
 * them away — this is where that is shown, where a stale copy can be fetched
 * again, where demucs can be installed or removed, and where a build living
 * somewhere unusual can be pointed at.
 */
export function ToolsModal({ onDismiss }: { onDismiss: () => void }) {
  const { tools, installs, busy, error, watch, refresh, dismissError } = useToolStatus()
  const installable = useToolStatus((state) => state.installable)

  useEffect(() => watch(), [watch])

  return (
    <Modal
      title="External tools"
      subtitle="Programs the app runs but does not ship"
      size="wide"
      onDismiss={onDismiss}
      footer={
        <>
          <span className="modal__foot-aside">
            <Button disabled={busy} onClick={() => void refresh(true)}>
              {busy ? 'Checking…' : 'Check again'}
            </Button>
          </span>
          <Button onClick={onDismiss}>Done</Button>
        </>
      }
    >
      {error === null ? null : (
        <p className="setting-error" onClick={dismissError}>
          {error}
        </p>
      )}

      {tools === null ? (
        <p className="tool-placeholder">Looking…</p>
      ) : (
        tools.map((tool) => (
          <ToolRow
            key={tool.name}
            tool={tool}
            install={installs.find((one) => one.tool === tool.name) ?? null}
            whyNot={installable[tool.name] ?? null}
            busy={busy}
          />
        ))
      )}
    </Modal>
  )
}

interface RowProps {
  tool: ToolStatus
  install: ToolInstall | null
  /** Why this machine cannot have the app's own copy, where it cannot. */
  whyNot: string | null
  busy: boolean
}

const percent = (fraction: number | null): string =>
  fraction === null ? '' : ` ${Math.round(fraction * 100)}%`

/** demucs is built rather than downloaded, and takes long enough to say so. */
const verb = (tool: ExternalTool): string => (tool === 'demucs' ? 'Installing' : 'Fetching')

function ToolRow({ tool, install, whyNot, busy }: RowProps) {
  const { install: put, remove, choose, clear } = useToolStatus()
  const working = install?.state === 'fetching'
  const mine = tool.source === 'private'

  const state = working
    ? `${verb(tool.name)}…${percent(install?.progress ?? null)}`
    : tool.path === null
      ? 'Not found'
      : TOOL_SOURCE_NAME[tool.source ?? 'system']

  const detail =
    install?.state === 'failed'
      ? `Could not put it in place: ${install.error ?? 'it did not say why'}`
      : tool.path === null
        ? (whyNot ?? (tool.name === 'demucs' ? `${tool.purpose} — ${DEMUCS_DOWNLOAD}` : tool.purpose))
        : (tool.version ?? tool.path)

  return (
    <div
      className="tool-row"
      data-found={tool.path !== null}
      data-busy={working}
      data-failed={install?.state === 'failed'}
    >
      <span className="tool-row__name num">{tool.name}</span>
      <span className="tool-row__detail" title={tool.path ?? tool.purpose}>
        {detail}
      </span>
      <span className="tool-row__state">{state}</span>
      <span className="tool-row__actions">
        {isProvidedTool(tool.name) && whyNot === null ? (
          <Button
            disabled={busy || working}
            onClick={() => void put(tool.name)}
            title={
              tool.name === 'demucs'
                ? `Install the app's own demucs — ${DEMUCS_DOWNLOAD}`
                : "Fetch a copy of the app's own, from where it is published"
            }
          >
            {mine ? 'Update' : 'Install'}
          </Button>
        ) : null}
        {isRemovableTool(tool.name) && mine ? (
          <Button
            disabled={busy || working}
            onClick={() => void remove(tool.name)}
            title="Delete the app's own copy and get the room back"
          >
            Remove
          </Button>
        ) : null}
        <Button disabled={busy || working} onClick={() => void choose(tool.name)}>
          Choose…
        </Button>
        <Button
          disabled={busy || working || tool.source !== 'chosen'}
          onClick={() => void clear(tool.name)}
          title="Go back to searching for it"
        >
          Reset
        </Button>
      </span>
    </div>
  )
}
