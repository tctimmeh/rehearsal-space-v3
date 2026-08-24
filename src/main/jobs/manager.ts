import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import type { ProgressReader } from '@core/jobs/progress'
import type { ChannelSubject } from '@core/song/channelSubject'
import type { Job } from '../../shared/jobs'

/** A finished job is marked done and then takes itself off the queue. */
const DONE_LINGER_MS = 4000
/** Progress arrives far faster than anyone can read it. */
const EMIT_INTERVAL_MS = 100
/** Enough of the tail to diagnose a failure without holding a whole log. */
const LOG_LINES = 500
/** How long a cancelled process gets to stop politely. */
const SIGKILL_DELAY_MS = 3000

export interface JobStep {
  command: string
  args: string[]
  cwd?: string
  /** Reads progress from the step's output lines. */
  progress?: ProgressReader
  /**
   * Consumes stdout as bytes instead of lines. Needed when a tool writes audio
   * to stdout, which must not be decoded as text — progress then has to come
   * from stderr instead.
   */
  onData?: (chunk: Buffer) => void
  /** Relative share of the job's progress. Defaults to an equal share. */
  weight?: number
}

/**
 * One piece of work as the user sees it, which may take several processes:
 * importing is a conversion and then a waveform pass, and that is one line in
 * the queue, not two.
 */
export interface JobSpec {
  title: string
  detail: string
  subject: ChannelSubject
  steps: JobStep[]
}

export interface JobManager {
  /** Registers the job at once; resolves when it succeeds, rejects when it does not. */
  run(spec: JobSpec): Promise<void>
  list(): Job[]
  log(id: string): string[]
  cancel(id: string): void
  dismiss(id: string): void
  /** Stops everything still running, for shutdown. */
  cancelAll(): void
}

interface JobRecord {
  job: Job
  log: string[]
  truncated: boolean
  child: ChildProcess | null
  timers: ReturnType<typeof setTimeout>[]
}

export class JobFailedError extends Error {
  constructor(
    message: string,
    readonly log: string[],
    readonly cancelled = false
  ) {
    super(message)
  }
}

/**
 * Signals the job's whole process group rather than just the process we
 * spawned. yt-dlp runs ffmpeg and demucs runs workers, and a survivor keeps the
 * output pipes open — which delays `close` until it finishes anyway, so a
 * cancel that only killed the parent would appear to do nothing.
 */
function signalGroup(record: JobRecord, signal: NodeJS.Signals): void {
  const pid = record.child?.pid
  if (pid === undefined) return
  try {
    process.kill(-pid, signal)
  } catch {
    /* Already gone, or never started. */
  }
}

/** Feeds whole lines to `onLine`, holding back a trailing partial line. */
function lineSplitter(onLine: (line: string) => void): (chunk: string) => void {
  let carry = ''
  return (chunk) => {
    /* Tools that draw progress bars use \r rather than \n to redraw in place. */
    const parts = (carry + chunk).split(/\r\n|\r|\n/)
    carry = parts.pop() ?? ''
    for (const part of parts) onLine(part)
  }
}

export function createJobManager(
  emit: (jobs: Job[]) => void,
  { lingerMs = DONE_LINGER_MS }: { lingerMs?: number } = {}
): JobManager {
  const records = new Map<string, JobRecord>()
  let emitTimer: ReturnType<typeof setTimeout> | null = null

  const list = (): Job[] => [...records.values()].map((record) => record.job)

  const emitNow = (): void => {
    if (emitTimer !== null) {
      clearTimeout(emitTimer)
      emitTimer = null
    }
    emit(list())
  }

  /** Progress changes constantly, so those emissions are paced. */
  const emitSoon = (): void => {
    if (emitTimer !== null) return
    emitTimer = setTimeout(() => {
      emitTimer = null
      emit(list())
    }, EMIT_INTERVAL_MS)
  }

  const append = (record: JobRecord, line: string): void => {
    record.log.push(line)
    if (record.log.length > LOG_LINES) {
      record.log.shift()
      record.truncated = true
    }
  }

  const dismiss = (id: string): void => {
    const record = records.get(id)
    if (record === undefined || record.job.state === 'running') return
    for (const timer of record.timers) clearTimeout(timer)
    records.delete(id)
    emitNow()
  }

  const finish = (record: JobRecord, state: Job['state'], error: string | null): void => {
    if (record.job.state !== 'running') return
    record.job.state = state
    record.job.error = error
    record.child = null
    if (state === 'done') record.job.progress = 1
    emitNow()

    /* Failures stay until the user dismisses them, so the log stays reachable. */
    if (state !== 'failed') {
      record.timers.push(setTimeout(() => dismiss(record.job.id), lingerMs))
    }
  }

  return {
    list,
    log: (id) => {
      const record = records.get(id)
      if (record === undefined) return []
      return record.truncated ? ['… earlier output dropped …', ...record.log] : [...record.log]
    },

    dismiss,

    cancel: (id) => {
      const record = records.get(id)
      if (record === null || record === undefined) return
      signalGroup(record, 'SIGTERM')
      record.timers.push(setTimeout(() => signalGroup(record, 'SIGKILL'), SIGKILL_DELAY_MS))
    },

    cancelAll: () => {
      for (const record of records.values()) signalGroup(record, 'SIGTERM')
    },

    run: async (spec) => {
      const record: JobRecord = {
        job: {
          id: randomUUID(),
          title: spec.title,
          detail: spec.detail,
          subject: spec.subject,
          state: 'running',
          progress: spec.steps.some((step) => step.progress !== undefined) ? 0 : null,
          error: null
        },
        log: [],
        truncated: false,
        child: null,
        timers: []
      }
      records.set(record.job.id, record)
      emitNow()

      const totalWeight = spec.steps.reduce((sum, step) => sum + (step.weight ?? 1), 0)
      let doneWeight = 0

      try {
        for (const step of spec.steps) {
          const weight = step.weight ?? 1
          await runStep(record, step, (fraction) => {
            if (record.job.progress === null) return
            record.job.progress = (doneWeight + fraction * weight) / totalWeight
            emitSoon()
          })
          doneWeight += weight
        }
      } catch (error) {
        const failure = error as JobFailedError
        if (failure.cancelled) {
          finish(record, 'cancelled', null)
          throw new JobFailedError(`${spec.title} was cancelled`, failure.log, true)
        }
        finish(record, 'failed', failure.message)
        throw failure
      }

      finish(record, 'done', null)
    }
  }
}


/** Runs one process to completion, reporting its progress as it goes. */
function runStep(
  record: JobRecord,
  step: JobStep,
  onProgress: (fraction: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    record.log.push(`$ ${step.command} ${step.args.join(' ')}`)

    const readLine = (line: string): void => {
      record.log.push(line)
      const fraction = step.progress?.(line)
      if (fraction !== undefined && fraction !== null) onProgress(fraction)
    }

    const child = spawn(step.command, step.args, {
      ...(step.cwd === undefined ? {} : { cwd: step.cwd }),
      stdio: ['ignore', 'pipe', 'pipe'],
      /* Its own process group, so cancelling takes the whole tree with it. */
      detached: true
    })
    record.child = child

    if (step.onData === undefined) {
      child.stdout?.setEncoding('utf8').on('data', lineSplitter(readLine))
    } else {
      child.stdout?.on('data', step.onData)
    }
    child.stderr?.setEncoding('utf8').on('data', lineSplitter(readLine))

    /* A missing tool arrives here, not as a non-zero exit code. */
    child.on('error', (error) => {
      const reason =
        'code' in error && error.code === 'ENOENT'
          ? `${step.command} was not found`
          : error.message
      record.log.push(reason)
      reject(new JobFailedError(reason, [...record.log]))
    })

    child.on('close', (code, signal) => {
      if (signal !== null) {
        reject(new JobFailedError('Cancelled', [...record.log], true))
      } else if (code === 0) {
        onProgress(1)
        resolve()
      } else {
        reject(new JobFailedError(`${step.command} exited with code ${code}`, [...record.log]))
      }
    })
  })
}
