import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { uniqueSlug } from '@core/song/slug'
import { takenStems } from './importAudio'
import { reservedIn, reserving } from './reserving'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'rehearsal-reserving-'))
  await mkdir(join(directory, 'audio'), { recursive: true })
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('ids promised to work that has not written its file yet', () => {
  it('gives them back while the work runs, and forgets them after', async () => {
    const during = await reserving(directory, ['Take 1'], async () => reservedIn(directory))

    expect(during).toEqual(['Take 1'])
    expect(reservedIn(directory)).toEqual([])
  })

  it('forgets them when the work fails', async () => {
    await expect(
      reserving(directory, ['Take 1'], async () => {
        throw new Error('ffmpeg fell over')
      })
    ).rejects.toThrow('ffmpeg fell over')

    expect(reservedIn(directory)).toEqual([])
  })

  it("keeps one song's promises out of another's", async () => {
    const other = await mkdtemp(join(tmpdir(), 'rehearsal-reserving-'))
    try {
      await reserving(directory, ['Take 1'], async () => {
        expect(reservedIn(other)).toEqual([])
      })
    } finally {
      await rm(other, { recursive: true, force: true })
    }
  })

  /*
   * A second add starting while the first is still converting sees a song and
   * an audio folder that know nothing about the first's channel. Both would
   * mint "Take 1", and the second would write its waveform over the first's.
   */
  it('stops a second add minting the id the first is already using', async () => {
    await reserving(directory, ['Take 1'], async () => {
      const taken = await takenStems(directory, [])
      expect(uniqueSlug('Take 1', taken)).not.toBe('Take 1')
    })
  })

  it('leaves the id free once nothing is using it', async () => {
    await reserving(directory, ['Take 1'], async () => undefined)

    expect(uniqueSlug('Take 1', await takenStems(directory, []))).toBe('Take 1')
  })

  /* The file on disk is still what settles it once the conversion has run. */
  it('still counts what has already been written', async () => {
    await writeFile(join(directory, 'audio', 'Take 1.ogg'), 'the take itself')

    expect(uniqueSlug('Take 1', await takenStems(directory, []))).not.toBe('Take 1')
  })
})
