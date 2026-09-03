import { describe, expect, it, vi } from 'vitest'

import { ffmpegProgress } from '@core/jobs/progress'
import type { Job } from '../../shared/jobs'
import { createJobManager, JobFailedError } from './manager'

/** Collects every emitted snapshot, so ordering can be asserted. */
function watcher() {
  const snapshots: Job[][] = []
  const manager = createJobManager((jobs) => snapshots.push(jobs.map((job) => ({ ...job }))), {
    lingerMs: 30
  })
  return { manager, snapshots, latest: () => snapshots.at(-1) ?? [] }
}

const shell = (script: string) => ({
  title: 'Testing',
  detail: 'a script',
  subject: 'other' as const,
  steps: [{ command: 'sh', args: ['-c', script] }]
})

describe('createJobManager', () => {
  it('shows the job while it runs and marks it done', async () => {
    const { manager, latest } = watcher()

    const running = manager.run(shell('echo working; exit 0'))
    expect(latest()[0]?.state).toBe('running')

    await running
    expect(latest()[0]?.state).toBe('done')
  })

  it('takes a finished job off the queue by itself', async () => {
    const { manager, latest } = watcher()
    await manager.run(shell('exit 0'))

    expect(latest()).toHaveLength(1)
    await vi.waitFor(() => expect(latest()).toHaveLength(0))
  })

  it('keeps a failed job until it is dismissed, so the log stays reachable', async () => {
    const { manager, latest } = watcher()

    await expect(manager.run(shell('echo bad things; exit 3'))).rejects.toBeInstanceOf(
      JobFailedError
    )

    const job = latest()[0]
    expect(job?.state).toBe('failed')
    expect(job?.error).toContain('exited with code 3')

    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(latest()).toHaveLength(1)

    manager.dismiss(job?.id ?? '')
    expect(latest()).toHaveLength(0)
  })

  it('retains output from both streams for the log', async () => {
    const { manager, latest } = watcher()
    await manager.run(shell('echo to stdout; echo to stderr 1>&2'))

    const log = manager.log(latest()[0]?.id ?? '')
    expect(log).toContain('to stdout')
    expect(log).toContain('to stderr')
    expect(log[0]).toMatch(/^\$ sh /)
  })

  it('reports a missing tool as a failure rather than crashing', async () => {
    const { manager, latest } = watcher()

    await expect(
      manager.run({ ...shell(''), steps: [{ command: 'definitely-not-a-real-tool', args: [] }] })
    ).rejects.toThrow(/was not found/)
    expect(latest()[0]?.state).toBe('failed')
  })

  it('reads progress from output, including bars redrawn with carriage returns', async () => {
    const { manager, snapshots } = watcher()

    /* The \r is what a tool redrawing a bar in place emits instead of \n. */
    await manager.run({
      ...shell(''),
      steps: [
        {
          command: 'sh',
          args: [
            '-c',
            'printf "out_time_us=60000000\\r"; sleep 0.2; printf "out_time_us=120000000\\n"; sleep 0.2'
          ],
          progress: ffmpegProgress(240)
        }
      ]
    })

    const seen = snapshots.flat().map((job) => job.progress)
    expect(seen).toContain(0.25)
    expect(seen).toContain(0.5)
    expect(seen.at(-1)).toBe(1)
  })

  it('kills the whole process tree, not just the process it spawned', async () => {
    const { manager, latest } = watcher()

    /* sh forks rather than execs here, so the grandchild outlives a naive kill
       and holds the output pipes open. */
    const running = manager.run(shell('sleep 30; echo never'))
    const startedAt = Date.now()
    manager.cancel(latest()[0]?.id ?? '')

    await expect(running).rejects.toThrow(/cancelled/)
    expect(Date.now() - startedAt).toBeLessThan(2000)
  })

  it('shows several processes as one job, weighted across the whole', async () => {
    const { manager, snapshots, latest } = watcher()

    await manager.run({
      ...shell(''),
      steps: [
        { command: 'sh', args: ['-c', 'echo one; sleep 0.15'], progress: () => null },
        { command: 'sh', args: ['-c', 'echo two; sleep 0.15'], progress: () => null }
      ]
    })

    /* One queue entry throughout, and the first step lands at the halfway mark. */
    expect(snapshots.every((snapshot) => snapshot.length <= 1)).toBe(true)
    expect(snapshots.flat().map((job) => job.progress)).toContain(0.5)
    expect(latest()[0]?.state).toBe('done')

    const log = manager.log(latest()[0]?.id ?? '')
    expect(log).toContain('one')
    expect(log).toContain('two')
  })

  it('stops at the first step that fails, without running the rest', async () => {
    const { manager, latest } = watcher()

    await expect(
      manager.run({
        ...shell(''),
        steps: [
          { command: 'sh', args: ['-c', 'exit 4'] },
          { command: 'sh', args: ['-c', 'echo should-not-run'] }
        ]
      })
    ).rejects.toThrow(/exited with code 4/)

    expect(manager.log(latest()[0]?.id ?? '')).not.toContain('should-not-run')
  })

  it('reads stdout as bytes when a step produces audio rather than text', async () => {
    const { manager } = watcher()
    const chunks: Buffer[] = []

    await manager.run({
      ...shell(''),
      steps: [
        {
          command: 'sh',
          args: ['-c', 'printf "\\001\\002\\377"; echo progress 1>&2'],
          onData: (chunk) => chunks.push(chunk)
        }
      ]
    })

    expect(Buffer.concat(chunks)).toEqual(Buffer.from([1, 2, 255]))
  })

  it('runs jobs in parallel and reports them independently', async () => {
    const { manager, latest } = watcher()

    const first = manager.run(shell('sleep 0.1; exit 0'))
    const second = manager.run({ ...shell('sleep 0.2; exit 0'), title: 'Also testing' })

    expect(latest()).toHaveLength(2)
    await Promise.all([first, second])
    expect(latest().every((job) => job.state === 'done')).toBe(true)
  })

  it('cancels a running job', async () => {
    const { manager, latest } = watcher()

    const running = manager.run(shell('sleep 5'))
    manager.cancel(latest()[0]?.id ?? '')

    await expect(running).rejects.toThrow(/cancelled/)
    expect(latest()[0]?.state).toBe('cancelled')
  })

  it('will not dismiss a job that is still running', async () => {
    const { manager, latest } = watcher()

    const running = manager.run(shell('sleep 0.1'))
    manager.dismiss(latest()[0]?.id ?? '')
    expect(latest()).toHaveLength(1)

    await running
  })
})

/*
 * Some steps have to be told where to look — the demucs install runs entirely
 * inside the app's own directory, and says so through the environment.
 */
describe('the environment a step runs in', () => {
  const said = (manager: ReturnType<typeof watcher>['manager'], id: string): string =>
    manager.log(id).join('\n')

  const ran = (script: string, env?: Record<string, string | undefined>) => ({
    ...shell(script),
    steps: [{ command: 'sh', args: ['-c', script], ...(env === undefined ? {} : { env }) }]
  })

  it('hands the step what it was given', async () => {
    const { manager, latest } = watcher()

    await manager.run(ran('echo "[$RS_MARK]"', { RS_MARK: 'here' }))

    expect(said(manager, latest()[0]?.id ?? '')).toContain('[here]')
  })

  /* Over the app's own environment, not instead of it: replacing it loses the
     machine's PATH, and on Windows what a process cannot start without. */
  it('keeps what the app already had', async () => {
    const { manager, latest } = watcher()

    await manager.run(ran('echo "[$HOME][$RS_MARK]"', { RS_MARK: 'here' }))

    expect(said(manager, latest()[0]?.id ?? '')).toContain(
      `[${process.env['HOME'] ?? ''}][here]`
    )
  })

  /* A user's own VIRTUAL_ENV or PYTHONPATH would be answered before the app's
     own, and the failure would look like the install being broken. */
  it('can take a variable away', async () => {
    const { manager, latest } = watcher()

    await manager.run(ran('echo "[$HOME]"', { HOME: undefined }))

    expect(said(manager, latest()[0]?.id ?? '')).toContain('[]')
  })

  it('gives it to that step and no other', async () => {
    const { manager, latest } = watcher()

    await manager.run({
      ...shell('echo'),
      steps: [
        { command: 'sh', args: ['-c', 'echo "one[$RS_MARK]"'], env: { RS_MARK: 'here' } },
        { command: 'sh', args: ['-c', 'echo "two[$RS_MARK]"'] }
      ]
    })

    const log = said(manager, latest()[0]?.id ?? '')
    expect(log).toContain('one[here]')
    expect(log).toContain('two[]')
  })
})
