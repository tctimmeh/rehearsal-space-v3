import { execFile } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Long enough for a slow mirror to answer, short enough to move on from one. */
const ANSWER_TIMEOUT_MS = 30000
/** How long a download may go on saying nothing at all before it is given up. */
const STALL_TIMEOUT_MS = 60000
/** A whole ffmpeg build is around a hundred megabytes. */
const UNPACK_TIMEOUT_MS = 180000

export type Progress = (fraction: number | null) => void

/**
 * Fetches a file, saying how far through it is.
 *
 * Written straight to disk rather than gathered in memory: these are hundred
 * megabyte downloads, and the app is holding a song's worth of audio already.
 *
 * There is no limit on how long the whole thing may take — a hundred megabytes
 * over a bad connection is slow, not broken — but one on how long it may go
 * without a byte arriving, so a download that has quietly died is given up on
 * rather than waited for forever.
 */
export async function downloadTo(url: string, path: string, onProgress: Progress): Promise<void> {
  const giveUp = new AbortController()
  let watchdog = setTimeout(() => giveUp.abort(), ANSWER_TIMEOUT_MS)
  const waitAgain = (ms: number): void => {
    clearTimeout(watchdog)
    watchdog = setTimeout(() => giveUp.abort(), ms)
  }

  try {
    const answer = await fetch(url, { redirect: 'follow', signal: giveUp.signal })
    if (!answer.ok) throw new Error(`${url} answered ${answer.status} ${answer.statusText}`)
    if (answer.body === null) throw new Error(`${url} sent nothing`)

    const expected = Number(answer.headers.get('content-length'))
    const total = Number.isFinite(expected) && expected > 0 ? expected : null
    let got = 0
    waitAgain(STALL_TIMEOUT_MS)

    const arriving = Readable.fromWeb(answer.body as Parameters<typeof Readable.fromWeb>[0])
    arriving.on('data', (chunk: Buffer) => {
      got += chunk.byteLength
      waitAgain(STALL_TIMEOUT_MS)
      onProgress(total === null ? null : got / total)
    })

    await pipeline(arriving, createWriteStream(path), { signal: giveUp.signal })
  } catch (error) {
    throw new Error(`${new URL(url).host}: ${whatWentWrong(error, giveUp.signal.aborted)}`)
  } finally {
    clearTimeout(watchdog)
  }
}

/**
 * Why a download failed, in words worth showing.
 *
 * `fetch` says only "fetch failed" and puts the reason worth reading — the
 * name that would not resolve, the connection refused — underneath it.
 */
function whatWentWrong(error: unknown, abandoned: boolean): string {
  if (abandoned) return 'it stopped answering'
  const cause = error instanceof Error ? (error as { cause?: unknown }).cause : null
  if (cause instanceof Error && cause.message !== '') return cause.message
  return error instanceof Error ? error.message : String(error)
}

/**
 * Takes named files out of a tarball, wherever in it they are.
 *
 * The two ffmpeg builds lay their tarballs out differently — one puts the
 * programs at the top of a versioned directory, the other under `bin` — so
 * what is asked for is the name, and where it turns up is not this code's
 * business.
 */
export async function unpackTarXz(archive: string, into: string, names: string[]): Promise<void> {
  await run('tar', ['-xJf', archive, '-C', into, '--wildcards', '--no-anchored', ...names], {
    timeout: UNPACK_TIMEOUT_MS
  })
}

/** Finds a file by name anywhere under a directory, or says there is none. */
export async function findNamed(root: string, name: string): Promise<string | null> {
  const entries = await readdir(root, { withFileTypes: true, recursive: true })
  const found = entries.find((entry) => entry.name === name && entry.isFile())
  return found === undefined ? null : join(found.parentPath, found.name)
}
