import { create } from 'zustand'

import type { Job } from '@shared/jobs'

interface JobsState {
  jobs: Job[]
  /** The job whose log is being read, if any. */
  inspecting: { job: Job; lines: string[] } | null

  watch: () => () => void
  inspect: (job: Job) => Promise<void>
  stopInspecting: () => void
  cancel: (id: string) => Promise<void>
  dismiss: (id: string) => Promise<void>
}

export const useJobs = create<JobsState>((set, get) => ({
  jobs: [],
  inspecting: null,

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
