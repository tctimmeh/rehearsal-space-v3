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

export interface JobSpec {
  title: string
  detail: string
  subject: ChannelSubject
  command: string
  args: string[]
  cwd?: string
  progress?: ProgressReader
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
    readonly log: string[]
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

    run: (spec) =>
      new Promise<void>((resolve, reject) => {
        const record: JobRecord = {
          job: {
            id: randomUUID(),
            title: spec.title,
            detail: spec.detail,
            subject: spec.subject,
            state: 'running',
            progress: spec.progress === undefined ? null : 0,
            error: null
          },
          log: [],
          truncated: false,
          child: null,
          timers: []
        }
        records.set(record.job.id, record)
        append(record, `$ ${spec.command} ${spec.args.join(' ')}`)
        emitNow()

        const readLine = (line: string): void => {
          append(record, line)
          const fraction = spec.progress?.(line)
          if (fraction === undefined || fraction === null) return
          record.job.progress = fraction
          emitSoon()
        }

        const child = spawn(spec.command, spec.args, {
          ...(spec.cwd === undefined ? {} : { cwd: spec.cwd }),
          stdio: ['ignore', 'pipe', 'pipe'],
          /* Its own process group, so cancelling takes the whole tree with it. */
          detached: true
        })
        record.child = child

        const toStdout = lineSplitter(readLine)
        const toStderr = lineSplitter(readLine)
        child.stdout?.setEncoding('utf8').on('data', toStdout)
        child.stderr?.setEncoding('utf8').on('data', toStderr)

        /* A missing tool arrives here, not as a non-zero exit code. */
        child.on('error', (error) => {
          const reason =
            'code' in error && error.code === 'ENOENT'
              ? `${spec.command} was not found`
              : error.message
          append(record, reason)
          finish(record, 'failed', reason)
          reject(new JobFailedError(reason, [...record.log]))
        })

        child.on('close', (code, signal) => {
          if (record.job.state !== 'running') return
          if (signal !== null) {
            finish(record, 'cancelled', null)
            reject(new JobFailedError(`${spec.title} was cancelled`, [...record.log]))
            return
          }
          if (code === 0) {
            finish(record, 'done', null)
            resolve()
            return
          }
          const reason = `${spec.command} exited with code ${code}`
          finish(record, 'failed', reason)
          reject(new JobFailedError(reason, [...record.log]))
        })
      })
  }
}
