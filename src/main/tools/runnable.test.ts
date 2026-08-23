import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { isRunnable } from './runnable'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'rehearsal-tools-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('isRunnable', () => {
  it('accepts an executable file', async () => {
    const path = join(root, 'demucs')
    await writeFile(path, '#!/bin/sh\n')
    await chmod(path, 0o755)
    expect(await isRunnable(path)).toBe(true)
  })

  it('rejects a directory, which carries the execute bit for traversal', async () => {
    /* Exactly the shape of a PyInstaller build: dist/demucs/demucs. */
    const path = join(root, 'demucs')
    await mkdir(path)
    await writeFile(join(path, 'demucs'), '#!/bin/sh\n')
    expect(await isRunnable(path)).toBe(false)
    expect(await isRunnable(join(path, 'demucs'))).toBe(false)
    await chmod(join(path, 'demucs'), 0o755)
    expect(await isRunnable(join(path, 'demucs'))).toBe(true)
  })

  it('rejects a file without the execute bit', async () => {
    const path = join(root, 'notes.txt')
    await writeFile(path, 'hello')
    expect(await isRunnable(path)).toBe(false)
  })

  it('rejects something that is not there', async () => {
    expect(await isRunnable(join(root, 'nope'))).toBe(false)
  })
})
