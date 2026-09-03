import { createReadStream } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createGunzip } from 'node:zlib'

/**
 * Reading named files out of a gzipped tarball, without any program to do it.
 *
 * `uv` publishes its Linux and macOS builds this way, and neither macOS nor
 * Windows has anything to open one with that can be relied on. gzip is
 * something Node undoes, and a tar is a file behind every 512-byte header, so
 * this is the whole of what is needed.
 *
 * Nothing checks the header's own checksum: gzip carries a CRC over the whole
 * stream and `createGunzip` refuses what does not match it, so a download that
 * arrived wrong is already an error before any of this is reached.
 */

const BLOCK = 512
/** Regular files, spelled two ways. Anything else here is not a program. */
const FILE_KINDS = new Set(['0', '\0'])

interface Header {
  name: string
  size: number
  kind: string
}

const upToNul = (block: Buffer, from: number, length: number): string =>
  block.toString('utf8', from, from + length).replace(/\0.*$/s, '')

/** A header block, or null for the run of zeros that ends an archive. */
function readHeader(block: Buffer): Header | null {
  if (block.every((byte) => byte === 0)) return null
  const name = upToNul(block, 0, 100)
  /* Long paths are split, with the front of them kept at the end of the block. */
  const prefix = upToNul(block, 345, 155)
  const size = Number.parseInt(upToNul(block, 124, 12).trim(), 8)
  return {
    name: prefix === '' ? name : `${prefix}/${name}`,
    size: Number.isFinite(size) ? size : 0,
    kind: block.toString('utf8', 156, 157)
  }
}

/** What is left of an entry: bytes to write, then bytes to the next block. */
interface Pending {
  to: FileHandle | null
  left: number
  padding: number
}

const padding = (size: number): number => (BLOCK - (size % BLOCK)) % BLOCK

/**
 * Takes the named files out of a `.tar.gz`, wherever in it they are.
 *
 * The name is what is asked for and where it turns up is not the caller's
 * business — uv's tarball holds a directory named after the build target.
 */
export async function unpackTarGz(
  archive: string,
  into: string,
  names: readonly string[]
): Promise<void> {
  const wanted = new Set(names)
  const arriving = createReadStream(archive).pipe(createGunzip())

  let held = Buffer.alloc(0)
  let pending: Pending | null = null

  const finish = async (): Promise<void> => {
    await pending?.to?.close()
    pending = null
  }

  try {
    for await (const chunk of arriving as AsyncIterable<Buffer>) {
      held = Buffer.concat([held, chunk])

      for (;;) {
        if (pending !== null) {
          const taking = Math.min(pending.left, held.length)
          if (taking > 0) {
            await pending.to?.write(held.subarray(0, taking))
            pending.left -= taking
            held = held.subarray(taking)
          }
          if (pending.left > 0) break
          const skipping = Math.min(pending.padding, held.length)
          pending.padding -= skipping
          held = held.subarray(skipping)
          if (pending.padding > 0) break
          await finish()
          continue
        }

        if (held.length < BLOCK) break
        const header = readHeader(held.subarray(0, BLOCK))
        held = held.subarray(BLOCK)
        if (header === null) continue

        const keeping = FILE_KINDS.has(header.kind) && wanted.has(basename(header.name))
        pending = {
          to: keeping ? await open(join(into, basename(header.name)), 'w') : null,
          left: header.size,
          padding: padding(header.size)
        }
      }
    }
  } finally {
    await finish()
  }
}
