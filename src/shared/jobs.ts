import type { ChannelSubject } from '@core/song/channelSubject'

export type JobState = 'running' | 'done' | 'failed' | 'cancelled'

/** What the queue shows about one piece of background work. */
export interface Job {
  id: string
  /** A brief description of the work, e.g. "Separating". */
  title: string
  /** What it is working on, e.g. "full_mix.ogg · htdemucs_6s". */
  detail: string
  /** Drives the lamp colour, from the locked channel-identity palette. */
  subject: ChannelSubject
  state: JobState
  /** Null when the tool reports nothing measurable. */
  progress: number | null
  error: string | null
}

export const isFinished = (job: Job): boolean => job.state !== 'running'
