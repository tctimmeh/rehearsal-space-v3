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
  command: 'sh',
  args: ['-c', script]
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
      manager.run({ ...shell(''), command: 'definitely-not-a-real-tool' })
    ).rejects.toThrow(/was not found/)
    expect(latest()[0]?.state).toBe('failed')
  })

  it('reads progress from output, including bars redrawn with carriage returns', async () => {
    const { manager, snapshots } = watcher()

    /* The \r is what a tool redrawing a bar in place emits instead of \n. */
    await manager.run({
      ...shell('printf "out_time_us=60000000\\r"; sleep 0.2; printf "out_time_us=120000000\\n"; sleep 0.2'),
      progress: ffmpegProgress(240)
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
