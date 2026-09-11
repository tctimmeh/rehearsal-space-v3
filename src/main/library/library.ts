import { access, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, normalize, parse, relative } from 'node:path'

import { fileStemFor } from '@core/song/fileName'
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

let writeCounter = 0

/**
 * Write to a sibling temp file and rename over the target, so an interrupted
 * write cannot leave a half-written file behind.
 *
 * The temp name has to be unique per write, not merely per process: two writes
 * to one file at once would otherwise share it, and the first rename would
 * move it out from under the second, which then fails on work that had in fact
 * succeeded.
 */
/**
 * Resolves a file inside a song's own folder, and refuses anything that climbs
 * out of it.
 *
 * Every path that reaches here came from song.json, which is a plain file the
 * user can edit and which travels with a song that might have been sent by
 * somebody else. A channel called `../../.ssh/id_rsa` should read nothing.
 */
export function insideSong(directory: string, file: string): string {
  /* `join` would quietly read this as relative and land inside the folder,
     which is harmless but not what anybody wrote. Nothing legitimate is
     absolute, so say so rather than reinterpreting it. */
  if (isAbsolute(file)) {
    throw new Error(`Refusing to touch anything outside the song folder: "${file}"`)
  }
  const target = normalize(join(directory, file))
  const inside = relative(directory, target)
  if (inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error(`Refusing to touch anything outside the song folder: "${file}"`)
  }
  return target
}

export async function writeAtomically(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  writeCounter += 1
  const temporary = `${path}.${process.pid}.${writeCounter}.tmp`
  try {
    await writeFile(temporary, contents, 'utf8')
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

export interface SongLibrary {
  list(): Promise<SongSummary[]>
  read(id: string): Promise<Song>
  create(): Promise<Song>
  write(song: Song): Promise<Song>
  /**
   * Reads the song, revises it and writes it back, with nothing else allowed
   * in between. Adding a channel has to be this rather than a read and a write
   * either side of the caller's own await: what is on disk while a job runs is
   * whatever the user has typed since it started, and a plain write would hand
   * back the version the job began with.
   */
  change(id: string, revise: (song: Song) => Song): Promise<Song>
  remove(id: string): Promise<void>
}

/**
 * One song's writes, in the order they were asked for.
 *
 * Keyed by id, and outside `createLibrary` because a library is made fresh for
 * every call — two operations on one song must meet here, and they only do if
 * the queue outlives them both.
 */
const turns = new Map<string, Promise<unknown>>()

function inTurn<T>(id: string, work: () => Promise<T>): Promise<T> {
  const mine = (turns.get(id) ?? Promise.resolve()).then(work)
  const settled = mine.then(
    () => undefined,
    () => undefined
  )
  turns.set(id, settled)
  void settled.then(() => {
    if (turns.get(id) === settled) turns.delete(id)
  })
  return mine
}

/** One directory per song, inside `root`. The directory name is the song's id. */
export interface LibraryOptions {
  /**
   * Whether this song has work going on inside it that would mind the ground
   * moving. See `holding.ts` — the short of it is that anything running holds
   * an absolute path into the song's folder, and renaming the folder makes
   * every one of those paths a lie.
   */
  heldStill?: (songId: string) => boolean
}

export function createLibrary(
  root: string,
  { heldStill = () => false }: LibraryOptions = {}
): SongLibrary {
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
    /* Not while work is under way in it. The name is worth having and not
       worth breaking an import for; the next save once the work is done does
       the renaming. */
    if (heldStill(song.id)) return song.id

    const target = uniqueSlug(desired, (await ids()).filter((id) => id !== song.id))
    if (target === song.id) return song.id

    await rename(await directoryOf(song.id), join(await ensureRoot(), target))
    return target
  }

  /**
   * Keeps each channel's audio file named after the channel.
   *
   * The file is the thing that gets dragged into a DAW, and going looking for
   * the "Rhythm" track to find it called "Take 1.ogg" is the sort of thing
   * that costs ten minutes and a swear. The name is the user's; the id is not,
   * and stays as it was — everything else in the song points at it, and the
   * waveform beside a channel is filed under it.
   *
   * A rename that fails leaves the channel pointing at the file it still has.
   * A name is worth having and is not worth losing a take for.
   */
  const renameFilesToMatchNames = async (song: Song, directory: string): Promise<Song> => {
    if (heldStill(song.id)) return song

    const audio = join(directory, 'audio')
    const onDisk = await readdir(audio).catch(() => [])
    const taken = new Set(onDisk.map((entry) => parse(entry).name))

    const channels = []
    for (const channel of song.channels) {
      if (channel.kind !== 'audio') {
        channels.push(channel)
        continue
      }

      const held = parse(channel.file).name
      taken.delete(held)
      const wanted = uniqueSlug(fileStemFor(channel.name), [...taken])
      if (wanted === held) {
        taken.add(held)
        channels.push(channel)
        continue
      }

      const file = join('audio', `${wanted}${extname(channel.file)}`)
      try {
        await rename(insideSong(directory, channel.file), insideSong(directory, file))
        taken.add(wanted)
        channels.push({ ...channel, file })
      } catch {
        taken.add(held)
        channels.push(channel)
      }
    }
    return { ...song, channels }
  }

  const writeNow = async (song: Song): Promise<Song> => {
    const id = await renameToMatchTitle(song)
    const directory = await directoryOf(id)
    await mkdir(directory, { recursive: true })
    const named = await renameFilesToMatchNames({ ...song, id }, directory)
    const saved: Song = { ...named, id, updatedAt: new Date().toISOString() }
    await writeAtomically(join(directory, SONG_FILE), `${JSON.stringify(saved, null, 2)}\n`)
    return saved
  }

  return {
    read,

    write: (song) => inTurn(song.id, () => writeNow(song)),

    change: (id, revise) =>
      inTurn(id, async () => {
        /* A folder that is no longer there has been renamed, which means the
           id this was asked for is one the caller learned before the rename.
           Reading it would invent an empty song and writing it back would
           recreate the folder, leaving the take in a directory nobody is ever
           going to open again. */
        if (!(await exists(await directoryOf(id)))) {
          throw new Error(`That song is no longer at "${id}".`)
        }
        return writeNow(revise(await read(id)))
      }),

    list: async () =>
      Promise.all(
        (await ids()).map(async (id) => {
          try {
            const song = await read(id)
            return summarise(song, await exists(join(await directoryOf(id), LYRICS_FILE)))
          } catch {
            /* A song we cannot read still exists; list it so it can be deleted. */
            return {
              id,
              title: id,
              artist: '',
              channelCount: 0,
              hasAudio: false,
              hasLyrics: false,
              hasTabs: false,
              tags: []
            }
          }
        })
      ),

    create: async () => {
      const id = uniqueSlug(slugify(DEFAULT_SONG_TITLE), await ids())
      await mkdir(await directoryOf(id), { recursive: true })
      return writeNow(newSong(id))
    },

    /** Removes all song data: configuration, audio, lyrics — the whole directory. */
    remove: async (id) => {
      await rm(await directoryOf(id), { recursive: true, force: true })
    }
  }
}
