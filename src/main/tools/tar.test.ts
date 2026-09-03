import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { unpackTarGz } from './tar'

/**
 * A tarball built by hand, so the reader is tested against the format rather
 * than against whatever wrote the fixture.
 */
interface Held {
  name: string
  content: string
  /** '0' is a file, '5' a directory, 'L' a GNU long name and so on. */
  kind?: string
}

const BLOCK = 512

function headerFor({ name, content, kind = '0' }: Held): Buffer {
  const header = Buffer.alloc(BLOCK)
  header.write(name, 0, 100, 'utf8')
  header.write('000644 \0', 100, 8, 'utf8')
  header.write(`${Buffer.byteLength(content).toString(8).padStart(11, '0')} `, 124, 12, 'utf8')
  header.write('00000000000 ', 136, 12, 'utf8')
  header.write(kind, 156, 1, 'utf8')
  header.write('ustar\0', 257, 6, 'utf8')
  header.write('00', 263, 2, 'utf8')

  /* The checksum is taken with its own field read as spaces. */
  header.write('        ', 148, 8, 'utf8')
  let sum = 0
  for (const byte of header) sum += byte
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8')
  return header
}

const padded = (content: string): Buffer => {
  const bytes = Buffer.from(content, 'utf8')
  const over = bytes.byteLength % BLOCK
  return over === 0 ? bytes : Buffer.concat([bytes, Buffer.alloc(BLOCK - over)])
}

const makeTarGz = (held: Held[]): Buffer =>
  gzipSync(
    Buffer.concat([
      ...held.flatMap((one) => [headerFor(one), padded(one.content)]),
      /* Two blocks of nothing is how a tar says it is over. */
      Buffer.alloc(BLOCK * 2)
    ])
  )

let room = ''

beforeEach(async () => {
  room = await mkdtemp(join(tmpdir(), 'tar-'))
})

afterEach(async () => {
  await rm(room, { recursive: true, force: true })
})

const tarOf = async (held: Held[]): Promise<string> => {
  const path = join(room, 'archive.tar.gz')
  await writeFile(path, makeTarGz(held))
  return path
}

const taken = (name: string): Promise<string | null> =>
  readFile(join(room, name), 'utf8').catch(() => null)

describe('taking files out of a gzipped tarball', () => {
  it('takes what was asked for', async () => {
    const archive = await tarOf([{ name: 'uv', content: 'the uv program' }])

    await unpackTarGz(archive, room, ['uv'])

    expect(await taken('uv')).toBe('the uv program')
  })

  /* uv's tarball holds a directory named after the build it is. */
  it('finds it wherever in the archive it is', async () => {
    const archive = await tarOf([
      { name: 'uv-x86_64-unknown-linux-gnu/uv', content: 'the uv program' },
      { name: 'uv-x86_64-unknown-linux-gnu/uvx', content: 'the uvx program' }
    ])

    await unpackTarGz(archive, room, ['uv', 'uvx'])

    expect(await taken('uv')).toBe('the uv program')
    expect(await taken('uvx')).toBe('the uvx program')
  })

  it('leaves the rest of the archive where it is', async () => {
    const archive = await tarOf([
      { name: 'uv-build/README.md', content: 'a readme nobody asked for' },
      { name: 'uv-build/uv', content: 'the program' },
      { name: 'uv-build/LICENSE', content: 'the licence' }
    ])

    await unpackTarGz(archive, room, ['uv'])

    expect(await taken('README.md')).toBeNull()
    expect(await taken('LICENSE')).toBeNull()
    expect(await taken('uv')).toBe('the program')
  })

  /* A directory carries the name too, and unpacking it over the program would
     leave something that cannot be run. */
  it('passes over a directory of the same name', async () => {
    const archive = await tarOf([
      { name: 'uv', content: '', kind: '5' },
      { name: 'uv-build/uv', content: 'the program' }
    ])

    await unpackTarGz(archive, room, ['uv'])

    expect(await taken('uv')).toBe('the program')
  })

  /*
   * The real thing is tens of megabytes, so it arrives in many pieces and one
   * file spans a great many blocks. Entries are also padded to the block, and
   * a reader that loses count of the padding reads the next header as data.
   */
  it('reads a file far longer than a block, and the one after it', async () => {
    const long = 'uv'.repeat(700000)
    const archive = await tarOf([
      { name: 'uv-build/uv', content: `${long}!` },
      { name: 'uv-build/uvx', content: 'the one after' }
    ])

    await unpackTarGz(archive, room, ['uv', 'uvx'])

    expect((await taken('uv'))?.length).toBe(long.length + 1)
    expect(await taken('uvx')).toBe('the one after')
  })

  it('says so when handed something that is not a tarball', async () => {
    const path = join(room, 'not-a-tarball')
    await writeFile(path, 'an html error page, most likely')

    await expect(unpackTarGz(path, room, ['uv'])).rejects.toThrow()
  })

  it('takes nothing when what was asked for is not in there', async () => {
    const archive = await tarOf([{ name: 'README', content: 'no programs here' }])

    await unpackTarGz(archive, room, ['uv'])

    expect(await taken('uv')).toBeNull()
  })
})
