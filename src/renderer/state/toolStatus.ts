import { create } from 'zustand'
import { useShallow } from 'zustand/shallow'

import type { ExternalTool, ToolInstall, ToolStatus } from '@shared/tools'

/**
 * What the app has of the programs it runs, and what it is putting in place.
 *
 * Two places ask: the tools panel, which is about them, and the mixer, which
 * has to know whether separating a track is going to work before it offers to
 * do it. One store rather than two copies of the same subscription.
 */
interface ToolStatusState {
  tools: ToolStatus[] | null
  installs: ToolInstall[]
  /** Why a tool cannot be installed on this machine, where it cannot. */
  installable: Partial<Record<ExternalTool, string>>
  busy: boolean

  /** Starts listening, and reads the first answer. Returns an unsubscribe. */
  watch: () => () => void
  refresh: (recheck?: boolean) => Promise<void>
  install: (tool: ExternalTool) => Promise<void>
  remove: (tool: ExternalTool) => Promise<void>
  choose: (tool: ExternalTool) => Promise<void>
  clear: (tool: ExternalTool) => Promise<void>
  error: string | null
  dismissError: () => void
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const useToolStatus = create<ToolStatusState>((set, get) => {
  const act = async (run: () => Promise<ToolStatus[] | null>): Promise<void> => {
    set({ busy: true, error: null })
    try {
      const tools = await run()
      if (tools !== null) set({ tools })
    } catch (failure) {
      set({ error: message(failure) })
    } finally {
      set({ busy: false })
    }
  }

  return {
    tools: null,
    installs: [],
    installable: {},
    busy: false,
    error: null,

    watch: () => {
      let fetching = false
      const stop = window.rehearsal.tools.onInstalls((installs) => {
        set({ installs })
        /* A copy that has just arrived changes what there is to show. */
        const now = installs.some((one) => one.state === 'fetching')
        if (fetching && !now) void get().refresh(true)
        fetching = now
      })
      void get().refresh(false)
      void window.rehearsal.tools.installs().then((installs) => set({ installs }))
      void window.rehearsal.tools.installable().then((installable) => set({ installable }))
      return stop
    },

    refresh: (recheck = false) => act(() => window.rehearsal.tools.status(recheck)),
    install: (tool) => act(() => window.rehearsal.tools.install(tool)),
    remove: (tool) => act(() => window.rehearsal.tools.remove(tool)),
    choose: (tool) => act(() => window.rehearsal.tools.choose(tool)),
    clear: (tool) => act(() => window.rehearsal.tools.clear(tool)),
    dismissError: () => set({ error: null })
  }
})

/**
 * What the app knows about one tool, for anywhere that needs only the one.
 *
 * Compared piece by piece rather than by the object it builds, which is a new
 * one every time it is asked for and would otherwise be a render without end.
 */
export const useToolNamed = (tool: ExternalTool) =>
  useToolStatus(
    useShallow((state) => {
      const status = state.tools?.find((one) => one.name === tool) ?? null
      return {
        /* Nothing is known until the first answer arrives, which is not the
           same as knowing the tool is missing. */
        known: state.tools !== null,
        found: status !== null && status.path !== null,
        installing: state.installs.some((one) => one.tool === tool && one.state === 'fetching'),
        whyNot: state.installable[tool] ?? null
      }
    })
  )
