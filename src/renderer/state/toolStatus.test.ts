// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ToolInstall } from '@shared/tools'
import { installBridge } from '@renderer/testing/bridge'
import { useToolStatus } from './toolStatus'

/** Whatever main is pushing about installs, under this test's control. */
let push: (installs: ToolInstall[]) => void = () => undefined

beforeEach(() => {
  installBridge()
  const tools = window.rehearsal.tools as unknown as Record<string, unknown>
  tools['onInstalls'] = vi.fn((handler: (installs: ToolInstall[]) => void) => {
    push = handler
    return () => undefined
  })
  tools['installs'] = vi.fn(async () => [])
  tools['installable'] = vi.fn(async () => ({}))
  useToolStatus.setState({ tools: null, installs: [], error: null })
})

afterEach(() => {
  vi.clearAllMocks()
})

const failing = (error: string): ToolInstall[] => [
  { tool: 'yt-dlp', state: 'failed', progress: null, error }
]

describe('when putting a tool in place goes wrong', () => {
  /*
   * The row it happened in is a corner of a dialog that may not even be open
   * — an install can be started from the mixer — and these messages are long,
   * being whatever the program said for itself.
   */
  it('says so where the whole of it can be read', () => {
    useToolStatus.getState().watch()

    /* As it really arrives: fetching, and then not. */
    push([{ tool: 'yt-dlp', state: 'fetching', progress: 0.4, error: null }])
    push(failing('the system stopped it outright'))

    expect(useToolStatus.getState().error).toBe(
      'yt-dlp: the system stopped it outright'
    )
  })

  it('names the tool, since several can be put in place', () => {
    useToolStatus.getState().watch()

    push(failing('it exited with code 1'))

    expect(useToolStatus.getState().error).toContain('yt-dlp')
  })

  /* Main goes on reporting a failure until something else happens to it, and
     a message that came back the moment it was waved away would be worse than
     no message. */
  it('does not put itself back after it has been waved away', () => {
    useToolStatus.getState().watch()
    push(failing('it exited with code 1'))
    useToolStatus.getState().dismissError()

    push(failing('it exited with code 1'))

    expect(useToolStatus.getState().error).toBeNull()
  })

  it('says so again when something else goes wrong', () => {
    useToolStatus.getState().watch()
    push(failing('it exited with code 1'))
    useToolStatus.getState().dismissError()

    push(failing('there was nothing there to run'))

    expect(useToolStatus.getState().error).toContain('nothing there to run')
  })

  /* Settling sends the app looking at what it has again, and that look must
     not take away the message that came with the failure. */
  it('holds on to it while the app looks at what it has again', async () => {
    useToolStatus.getState().watch()

    push([{ tool: 'yt-dlp', state: 'fetching', progress: 0.9, error: null }])
    push(failing('it exited with code 1'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(useToolStatus.getState().error).toContain('it exited with code 1')
  })

  it('says nothing at all while everything is going well', () => {
    useToolStatus.getState().watch()

    push([{ tool: 'yt-dlp', state: 'fetching', progress: 0.4, error: null }])

    expect(useToolStatus.getState().error).toBeNull()
  })
})
