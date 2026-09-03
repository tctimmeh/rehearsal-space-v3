import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { unpackZip } from './zip'

/**
 * A zip built by hand, so the reader is tested against the format rather than
 * against whatever wrote the fixture.
 */
interface Held {
  name: string
  content: string
  /** Stored entries are legal and some writers emit them. */
  stored?: boolean
}

function makeZip(held: Held[]): Buffer {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let at = 0

  for (const one of held) {
    const name = Buffer.from(one.name, 'utf8')
    const plain = Buffer.from(one.content, 'utf8')
    const packed = one.stored === true ? plain : deflateRawSync(plain)
    const method = one.stored === true ? 0 : 8

    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(method, 8)
    header.writeUInt32LE(crc32(plain), 14)
    header.writeUInt32LE(packed.byteLength, 18)
    header.writeUInt32LE(plain.byteLength, 22)
    header.writeUInt16LE(name.byteLength, 26)
    locals.push(header, name, packed)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(method, 10)
    entry.writeUInt32LE(crc32(plain), 16)
    entry.writeUInt32LE(packed.byteLength, 20)
    entry.writeUInt32LE(plain.byteLength, 24)
    entry.writeUInt16LE(name.byteLength, 28)
    entry.writeUInt32LE(at, 42)
    central.push(entry, name)

    at += header.byteLength + name.byteLength + packed.byteLength
  }

  const body = Buffer.concat(locals)
  const index = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(held.length, 8)
  end.writeUInt16LE(held.length, 10)
  end.writeUInt32LE(index.byteLength, 12)
  end.writeUInt32LE(body.byteLength, 16)
  return Buffer.concat([body, index, end])
}

let room = ''

beforeEach(async () => {
  room = await mkdtemp(join(tmpdir(), 'zip-'))
})

afterEach(async () => {
  await rm(room, { recursive: true, force: true })
})

const zipOf = async (held: Held[]): Promise<string> => {
  const path = join(room, 'archive.zip')
  await writeFile(path, makeZip(held))
  return path
}

const taken = (name: string): Promise<string | null> =>
  readFile(join(room, name), 'utf8').catch(() => null)

describe('taking files out of a zip', () => {
  it('takes what was asked for', async () => {
    const archive = await zipOf([{ name: 'ffmpeg', content: 'the ffmpeg program' }])

    await unpackZip(archive, room, ['ffmpeg'])

    expect(await taken('ffmpeg')).toBe('the ffmpeg program')
  })

  /* One build keeps them under `bin`, another at the top of a versioned
     directory. Where they are is not the caller's business. */
  it('finds them wherever in the archive they are', async () => {
    const archive = await zipOf([
      { name: 'ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe', content: 'ffmpeg for windows' },
      { name: 'ffmpeg-master-latest-win64-gpl/bin/ffprobe.exe', content: 'ffprobe for windows' }
    ])

    await unpackZip(archive, room, ['ffmpeg.exe', 'ffprobe.exe'])

    expect(await taken('ffmpeg.exe')).toBe('ffmpeg for windows')
    expect(await taken('ffprobe.exe')).toBe('ffprobe for windows')
  })

  it('leaves the rest of the archive where it is', async () => {
    const archive = await zipOf([
      { name: 'ffmpeg-7.1/bin/ffmpeg.exe', content: 'the program' },
      { name: 'ffmpeg-7.1/doc/ffmpeg.html', content: 'a manual nobody asked for' },
      { name: 'ffmpeg-7.1/LICENSE', content: 'the licence' }
    ])

    await unpackZip(archive, room, ['ffmpeg.exe'])

    expect(await taken('ffmpeg.html')).toBeNull()
    expect(await taken('LICENSE')).toBeNull()
  })

  it('reads an entry that was stored rather than packed', async () => {
    const archive = await zipOf([{ name: 'yt-dlp.exe', content: 'stored whole', stored: true }])

    await unpackZip(archive, room, ['yt-dlp.exe'])

    expect(await taken('yt-dlp.exe')).toBe('stored whole')
  })

  /* Real builds are tens of megabytes; the reader must not be fooled by a
     size that happens to fit in one read. */
  it('reads an entry far larger than a buffer of headers', async () => {
    const long = 'ffmpeg'.repeat(200000)
    const archive = await zipOf([{ name: 'ffmpeg', content: long }])

    await unpackZip(archive, room, ['ffmpeg'])

    expect((await taken('ffmpeg'))?.length).toBe(long.length)
  })

  /* A file that arrived wrong is a program that will not run, and worse, one
     that looks like the tool itself being broken. */
  it('refuses a file that does not add up to what the archive says', async () => {
    const archive = await zipOf([{ name: 'ffmpeg', content: 'the ffmpeg program' }])
    const bytes = await readFile(archive)
    /* Break the stored copy of the checksum, as a bad download would. */
    bytes.writeUInt32LE(0x11111111, bytes.byteLength - 22 - 46 - 'ffmpeg'.length + 16)
    await writeFile(archive, bytes)

    await expect(unpackZip(archive, room, ['ffmpeg'])).rejects.toThrow(/damaged/)
  })

  it('says so when handed something that is not a zip', async () => {
    const path = join(room, 'not-a-zip')
    await writeFile(path, 'an html error page, most likely')

    await expect(unpackZip(path, room, ['ffmpeg'])).rejects.toThrow(/not a zip/)
  })

  it('takes nothing when what was asked for is not in there', async () => {
    const archive = await zipOf([{ name: 'README', content: 'no programs here' }])

    await unpackZip(archive, room, ['ffmpeg'])

    expect(await taken('ffmpeg')).toBeNull()
  })
})
