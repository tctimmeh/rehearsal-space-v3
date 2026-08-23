import { access, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { migrateSong } from '@core/song/migrate'
import { isSafeSongId, slugify, uniqueSlug } from '@core/song/slug'
import {
  DEFAULT_SONG_TITLE,
  newSong,
  summarise,
  type Song,
  type SongSummary
} from '@core/song/song'

const SONG_FILE = 'song.json'
const LYRICS_FILE = 'lyrics.txt'

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Write to a sibling temp file and rename over the target, so an interrupted
 * write cannot leave a half-written file behind.
 */
export async function writeAtomically(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, contents, 'utf8')
  await rename(temporary, path)
}

export interface SongLibrary {
  list(): Promise<SongSummary[]>
  read(id: string): Promise<Song>
  create(): Promise<Song>
  write(song: Song): Promise<Song>
  remove(id: string): Promise<void>
}

/** One directory per song, inside `root`. The directory name is the song's id. */
export function createLibrary(root: string): SongLibrary {
  const ensureRoot = async (): Promise<string> => {
    await mkdir(root, { recursive: true })
    return root
  }

  const directoryOf = async (id: string): Promise<string> => {
    if (!isSafeSongId(id)) throw new Error(`Refusing to touch an unsafe song id: "${id}"`)
    return join(await ensureRoot(), id)
  }

  /** Every song directory, which is also the set of taken slugs. */
  const ids = async (): Promise<string[]> => {
    const entries = await readdir(await ensureRoot(), { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && isSafeSongId(entry.name))
      .map((entry) => entry.name)
  }

  const read = async (id: string): Promise<Song> => {
    const directory = await directoryOf(id)
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(join(directory, SONG_FILE), 'utf8'))
    } catch {
      raw = undefined
    }
    return migrateSong(raw, id)
  }

  /**
   * The directory name tracks the title, because every song starts life as
   * "New Song" and a library folder full of `new-song-7` is unusable. Renaming
   * carries the audio with it, since channel files are stored relative to the
   * song directory.
   */
  const renameToMatchTitle = async (song: Song): Promise<string> => {
    const desired = slugify(song.title)
    if (desired === song.id) return song.id

    const target = uniqueSlug(desired, (await ids()).filter((id) => id !== song.id))
    if (target === song.id) return song.id

    await rename(await directoryOf(song.id), join(await ensureRoot(), target))
    return target
  }

  const write = async (song: Song): Promise<Song> => {
    const id = await renameToMatchTitle(song)
    const saved: Song = { ...song, id, updatedAt: new Date().toISOString() }
    const directory = await directoryOf(id)
    await mkdir(directory, { recursive: true })
    await writeAtomically(join(directory, SONG_FILE), `${JSON.stringify(saved, null, 2)}\n`)
    return saved
  }

  return {
    read,
    write,

    list: async () =>
      Promise.all(
        (await ids()).map(async (id) => {
          try {
            const song = await read(id)
            return summarise(song, await exists(join(await directoryOf(id), LYRICS_FILE)))
          } catch {
            /* A song we cannot read still exists; list it so it can be deleted. */
            return { id, title: id, artist: '', channelCount: 0, hasLyrics: false }
          }
        })
      ),

    create: async () => {
      const id = uniqueSlug(slugify(DEFAULT_SONG_TITLE), await ids())
      await mkdir(await directoryOf(id), { recursive: true })
      return write(newSong(id))
    },

    /** Removes all song data: configuration, audio, lyrics — the whole directory. */
    remove: async (id) => {
      await rm(await directoryOf(id), { recursive: true, force: true })
    }
  }
}
