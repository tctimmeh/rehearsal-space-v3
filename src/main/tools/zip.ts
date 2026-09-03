import { createWriteStream } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createInflateRaw, crc32 } from 'node:zlib'

/**
 * Reading named files out of a zip, without any program to do it.
 *
 * Every macOS and Windows build of these tools is published as a zip, and
 * neither has anything to unpack one with that can be relied on — Node has
 * deflate built in, and a zip is a handful of headers around it, so this is
 * the whole of what is needed rather than a dependency or a shelled-out
 * command that may not be there.
 *
 * Only what these archives use is understood: stored and deflated entries, no
 * encryption, and sizes that fit in the classic 32-bit fields.
 */

const END_RECORD = 0x06054b50
const CENTRAL_ENTRY = 0x02014b50
const LOCAL_HEADER = 0x04034b50
/** The end record is 22 bytes, plus a comment of up to 64k after it. */
const TAIL_BYTES = 22 + 0xffff
const STORED = 0
const DEFLATED = 8
/** What a 32-bit field says when the real value is in a zip64 record. */
const TOO_BIG = 0xffffffff

interface Entry {
  name: string
  method: number
  compressedBytes: number
  /** What the file should add up to, which is how a bad unpack is caught. */
  checksum: number
  /** Where the entry's own header is, which is where its bytes are found. */
  headerAt: number
}

/** Reads the last of a file, which is where a zip keeps its index. */
async function readTail(file: FileHandle, size: number): Promise<Buffer> {
  const from = Math.max(0, size - TAIL_BYTES)
  const tail = Buffer.alloc(size - from)
  await file.read(tail, 0, tail.byteLength, from)
  return tail
}

function findEndRecord(tail: Buffer): number {
  for (let at = tail.byteLength - 22; at >= 0; at -= 1) {
    if (tail.readUInt32LE(at) === END_RECORD) return at
  }
  throw new Error('not a zip file')
}

function readIndex(central: Buffer): Entry[] {
  const entries: Entry[] = []
  let at = 0
  while (at + 46 <= central.byteLength && central.readUInt32LE(at) === CENTRAL_ENTRY) {
    const nameLength = central.readUInt16LE(at + 28)
    const extraLength = central.readUInt16LE(at + 30)
    const commentLength = central.readUInt16LE(at + 32)
    entries.push({
      name: central.toString('utf8', at + 46, at + 46 + nameLength),
      method: central.readUInt16LE(at + 10),
      checksum: central.readUInt32LE(at + 16),
      compressedBytes: central.readUInt32LE(at + 20),
      headerAt: central.readUInt32LE(at + 42)
    })
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/** Where an entry's bytes start, which its own header has to be read to know. */
async function bytesStartAt(file: FileHandle, entry: Entry): Promise<number> {
  const header = Buffer.alloc(30)
  await file.read(header, 0, 30, entry.headerAt)
  if (header.readUInt32LE(0) !== LOCAL_HEADER) throw new Error(`${entry.name} is not where it said`)
  return entry.headerAt + 30 + header.readUInt16LE(26) + header.readUInt16LE(28)
}

async function writeOut(file: FileHandle, entry: Entry, to: string): Promise<void> {
  if (entry.method !== STORED && entry.method !== DEFLATED) {
    throw new Error(`${entry.name} is packed in a way this cannot read`)
  }
  if (entry.compressedBytes === TOO_BIG || entry.headerAt === TOO_BIG) {
    throw new Error(`${entry.name} is too big for this to read`)
  }

  const from = await bytesStartAt(file, entry)
  const bytes = file.createReadStream({
    start: from,
    end: from + entry.compressedBytes - 1,
    autoClose: false
  })

  /* A zip says what each file should add up to. Checking it is what turns a
     download that arrived wrong into an error rather than a broken program. */
  let sum = 0
  const adding = new Transform({
    transform(chunk: Buffer, _encoding, next) {
      sum = crc32(chunk, sum)
      next(null, chunk)
    }
  })

  const out = createWriteStream(to)
  await (entry.method === STORED
    ? pipeline(bytes, adding, out)
    : pipeline(bytes, createInflateRaw(), adding, out))

  if (sum !== entry.checksum) throw new Error(`${entry.name} arrived damaged`)
}

/**
 * Takes the named files out of a zip, wherever in it they are.
 *
 * The name is what is asked for and where it turns up is not the caller's
 * business: one Windows build keeps the programs under `bin`, another at the
 * top of a versioned directory, and a macOS build has nothing around them.
 */
export async function unpackZip(
  archive: string,
  into: string,
  names: readonly string[]
): Promise<void> {
  const file = await open(archive, 'r')
  try {
    const { size } = await file.stat()
    const tail = await readTail(file, size)
    const end = findEndRecord(tail)
    const centralAt = tail.readUInt32LE(end + 16)
    const centralBytes = tail.readUInt32LE(end + 12)
    if (centralAt === TOO_BIG) throw new Error('the zip is too big for this to read')

    const central = Buffer.alloc(centralBytes)
    await file.read(central, 0, centralBytes, centralAt)

    const wanted = new Set(names)
    for (const entry of readIndex(central)) {
      const name = basename(entry.name)
      if (wanted.has(name)) await writeOut(file, entry, join(into, name))
    }
  } finally {
    await file.close()
  }
}
