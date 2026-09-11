import { create } from 'zustand'

import type { Job } from '@shared/jobs'

/**
 * Work the renderer is doing itself, which main's queue knows nothing about.
 *
 * Everything else that takes a moment is a process main runs, so it reports
 * from there. Keeping a take is not: the take is in this window, and turning it
 * into a file happens here before main is handed anything at all. Without this
 * there was nothing on screen between stopping a long recording and the
 * importing job appearing, which reads as the take having gone missing.
 */
export interface Working {
  id: string
  title: string
  detail: string
}

interface JobsState {
  jobs: Job[]
  working: Working[]
  /** The job whose log is being read, if any. */
  inspecting: { job: Job; lines: string[] } | null

  startWork: (work: Working) => void
  endWork: (id: string) => void
  watch: () => () => void
  inspect: (job: Job) => Promise<void>
  stopInspecting: () => void
  cancel: (id: string) => Promise<void>
  dismiss: (id: string) => Promise<void>
}

export const useJobs = create<JobsState>((set, get) => ({
  jobs: [],
  working: [],
  inspecting: null,

  startWork: (work) =>
    set((state) => ({ working: [...state.working.filter((one) => one.id !== work.id), work] })),
  endWork: (id) => set((state) => ({ working: state.working.filter((one) => one.id !== id) })),

  /** Main pushes the whole queue whenever it changes; it is never long. */
  watch: () => {
    const stop = window.rehearsal.jobs.onChanged((jobs) => {
      set({ jobs })
      /* Keep an open log in step with the job it belongs to. */
      const inspecting = get().inspecting
      if (inspecting === null) return
      const updated = jobs.find((job) => job.id === inspecting.job.id)
      set({ inspecting: updated === undefined ? null : { ...inspecting, job: updated } })
    })
    void window.rehearsal.jobs.list().then((jobs) => set({ jobs }))
    return stop
  },

  inspect: async (job) => {
    set({ inspecting: { job, lines: await window.rehearsal.jobs.log(job.id) } })
  },

  stopInspecting: () => set({ inspecting: null }),
  cancel: (id) => window.rehearsal.jobs.cancel(id),
  dismiss: (id) => window.rehearsal.jobs.dismiss(id)
}))
