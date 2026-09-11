import { dirname, isAbsolute, join, normalize, relative } from 'node:path'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import type { AudioChannel, Song, SongSummary } from '@core/song/song'
import type { SeparateRequest } from '../../shared/stems'
import { readConfig, updateConfig } from '../config'
import { downloadAudio } from '../import/download'
import { importAudio } from '../import/importAudio'
import { separateStems } from '../import/separate'
import { holdingSong, songIsHeld } from './holding'
import { createLibrary, insideSong, writeAtomically, type SongLibrary } from './library'

/** The library folder is a setting, so it is resolved per call rather than held. */
/* Nothing renames a song's folder while something is working inside it. */
const library = async () =>
  createLibrary((await readConfig()).libraryPath, { heldStill: songIsHeld })

export const listSongs = async (): Promise<SongSummary[]> => (await library()).list()
export const readSong = async (id: string): Promise<Song> => (await library()).read(id)
export const createSong = async (): Promise<Song> => (await library()).create()

export async function writeSong(song: Song): Promise<Song> {
  return followingTheId(song.id, async () => (await library()).write(song))
}

/** A title change renames the directory, which changes the song's id. */
async function followingTheId(id: string, write: () => Promise<Song>): Promise<Song> {
  const saved = await write()
  const { lastSongId } = await readConfig()
  if (lastSongId === id && saved.id !== id) await updateConfig({ lastSongId: saved.id })
  return saved
}

/**
 * Runs a job inside a song's folder and folds what it produced into song.json.
 *
 * The fold happens while the song is still held, and that is the whole point:
 * the id the job was started with is only the song's id for as long as nothing
 * can rename the folder. Appending after the hold was let go meant a name
 * typed during a download could land in the gap — and then the take was
 * written into a directory that had just been renamed away, recreating it, so
 * the channel was in one folder and the song was in another.
 *
 * That write is also the job's own last word, and is entitled to the rename it
 * deferred: the work is over, no path into the folder is being held any more,
 * and it is still inside the hold, so nothing else can be either.
 *
 * A job that fails renames nothing, and the next save does it instead. The
 * renderer only learns the new id from the reply it is not going to get, and a
 * song whose folder has moved without it knowing is worse than one whose
 * folder is still called what it was called this morning.
 */
async function adding(
  songId: string,
  work: (song: Song, directory: string) => Promise<(song: Song) => Song>
): Promise<Song> {
  return holdingSong(songId, async () => {
    const directory = await songDirectory(songId)
    const revise = await work(await readSong(songId), directory)
    return followingTheId(songId, async () => (await finishing(songId)).change(songId, revise))
  })
}

/**
 * The library as the job that is finishing sees it: every other song still
 * held, and its own no longer, so the settling write performs the rename that
 * was put off while the work ran.
 */
const finishing = async (songId: string): Promise<SongLibrary> =>
  createLibrary((await readConfig()).libraryPath, {
    heldStill: (id) => id !== songId && songIsHeld(id)
  })

export async function deleteSong(id: string): Promise<void> {
  await (await library()).remove(id)
  const { lastSongId } = await readConfig()
  if (lastSongId === id) await updateConfig({ lastSongId: null })
}


const songDirectory = async (id: string): Promise<string> =>
  join((await readConfig()).libraryPath, id)

/**
 * Imports a file as a new channel. The song on disk is the authority here:
 * the renderer may have unsaved edits of its own, so only the channel list
 * comes back.
 */
export async function importChannel(songId: string, sourcePath: string): Promise<Song> {
  return adding(songId, async (existing, directory) => {
    const channel = await importAudio({
      songDirectory: directory,
      sourcePath,
      takenIds: existing.channels.map((entry) => entry.id)
    })
    return (song) => ({ ...song, channels: [...song.channels, channel] })
  })
}

/** Removes a channel and the files that belong only to it. */
export async function removeChannel(songId: string, channelId: string): Promise<Song> {
  return adding(songId, async (song, directory) => {
    const channel = song.channels.find((entry) => entry.id === channelId)
    if (channel?.kind === 'audio') {
      await rm(join(directory, channel.file), { force: true })
      await rm(join(directory, 'peaks', `${channel.id}.peaks`), { force: true })
    }
    return (current) => ({
      ...current,
      channels: current.channels.filter((entry) => entry.id !== channelId)
    })
  })
}


/**
 * Reads a channel's audio for decoding in the renderer. The path comes from
 * song.json, which is editable by hand, so it is confined to the song's own
 * directory before anything is opened.
 */
export async function readChannelAudio(songId: string, file: string): Promise<Buffer> {
  return readFile(insideSong(await songDirectory(songId), file))
}


/** Reads and writes one of a song's tablature files. */
export async function readTab(songId: string, file: string): Promise<string> {
  try {
    return await readFile(insideSong(await songDirectory(songId), file), 'utf8')
  } catch {
    /* A tab file listed but not written yet is simply empty. */
    return ''
  }
}

export async function writeTab(songId: string, file: string, text: string): Promise<void> {
  const directory = await songDirectory(songId)
  const target = insideSong(directory, file)
  await mkdir(dirname(target), { recursive: true })
  await writeAtomically(target, text)
}

const LYRICS_FILE = 'lyrics.txt'

/** The words of a song, as plain text so they can be pasted anywhere. */
export async function readLyrics(songId: string): Promise<string> {
  try {
    return await readFile(join(await songDirectory(songId), LYRICS_FILE), 'utf8')
  } catch {
    /* A song nobody has written words for yet. */
    return ''
  }
}

export async function writeLyrics(songId: string, text: string): Promise<void> {
  const path = join(await songDirectory(songId), LYRICS_FILE)
  if (text.trim() === '') {
    await rm(path, { force: true })
    return
  }
  await writeAtomically(path, text)
}

/** Downloads the audio behind a URL and adds it as a channel. */
export async function downloadChannel(songId: string, url: string): Promise<Song> {
  return adding(songId, async (existing, directory) => {
    const channel = await downloadAudio(
      directory,
      url,
      existing.channels.map((entry) => entry.id)
    )
    return (song) => ({ ...song, channels: [...song.channels, channel] })
  })
}

/**
 * Splits a channel into instruments. The original is kept — separation is not
 * a conversion — and is usually muted, since hearing it under its own parts is
 * rarely what anyone wants.
 */
export async function separateChannel(
  songId: string,
  request: SeparateRequest
): Promise<Song> {
  return adding(songId, async (before, directory) => {
    const source = before.channels.find((entry) => entry.id === request.channelId)
    if (source === undefined || source.kind !== 'audio') {
      throw new Error('That channel has no audio to separate.')
    }
    const stems = await separateStems(
      directory,
      source as AudioChannel,
      request,
      before.channels.map((entry) => entry.id)
    )
    return (song) => ({
      ...song,
      channels: [
        ...song.channels.map((entry) =>
          entry.id === request.channelId && request.muteSource
            ? { ...entry, muted: true }
            : entry
        ),
        ...stems
      ]
    })
  })
}


/** The precomputed waveform for a channel, for the alignment tool to draw. */
export async function readChannelPeaks(songId: string, channelId: string): Promise<Buffer> {
  return readChannelAudio(songId, join('peaks', `${channelId}.peaks`))
}


/** Adds a take: the bytes are written out and imported like any other file. */
export async function addRecording(
  songId: string,
  wav: Uint8Array,
  startTime: number,
  name: string
): Promise<Song> {
  return adding(songId, async (existing, directory) => {
    const workspace = await mkdtemp(join(tmpdir(), 'rehearsal-take-'))
    const source = join(workspace, `${name}.wav`)

    try {
      await writeFile(source, wav)
      const channel = await importAudio({
        songDirectory: directory,
        sourcePath: source,
        takenIds: existing.channels.map((entry) => entry.id),
        origin: { type: 'record' },
        name,
        /* Whatever was played into it, it is certainly not the full mix —
           which is what an unrecognised name would otherwise be taken for. */
        subject: 'other',
        startTime
      })
      return (song) => ({ ...song, channels: [...song.channels, channel] })
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
}
