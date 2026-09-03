import { describe, expect, it, vi } from 'vitest'

import { updateInPlace } from './update'

describe('keeping yt-dlp current', () => {
  it('asks the copy the app fetched to update itself', async () => {
    const run = vi.fn(async () => undefined)

    const ran = await updateInPlace({ path: '/app/tools/yt-dlp', source: 'private' }, run)

    expect(ran).toBe(true)
    expect(run).toHaveBeenCalledWith('/app/tools/yt-dlp', ['-U'])
  })

  /*
   * `-U` rewrites the program where it stands. A package manager's file is
   * that package manager's business, and a build somebody pointed the app at
   * was pointed at deliberately.
   */
  it('leaves alone a copy that belongs to somebody else', async () => {
    const run = vi.fn(async () => undefined)

    for (const source of ['system', 'chosen', 'bundled'] as const) {
      expect(await updateInPlace({ path: '/usr/bin/yt-dlp', source }, run)).toBe(false)
    }

    expect(run).not.toHaveBeenCalled()
  })

  it('has nothing to update when there is no yt-dlp at all', async () => {
    const run = vi.fn(async () => undefined)

    expect(await updateInPlace(null, run)).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  /* Whoever calls this decides what to make of a failure; it does not swallow
     it here, because "could not" and "did not need to" are different. */
  it('passes on what went wrong rather than hiding it', async () => {
    const run = vi.fn(async () => Promise.reject(new Error('no route to host')))

    await expect(
      updateInPlace({ path: '/app/tools/yt-dlp', source: 'private' }, run)
    ).rejects.toThrow(/no route/)
  })
})
