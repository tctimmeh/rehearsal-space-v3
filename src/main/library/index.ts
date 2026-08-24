import { isAbsolute, join, normalize, relative } from 'node:path'
import { readFile, rm } from 'node:fs/promises'

import type { Song, SongSummary } from '@core/song/song'
import { readConfig, updateConfig } from '../config'
import { importAudio } from '../import/importAudio'
import { createLibrary } from './library'

/** The library folder is a setting, so it is resolved per call rather than held. */
const library = async () => createLibrary((await readConfig()).libraryPath)

export const listSongs = async (): Promise<SongSummary[]> => (await library()).list()
export const readSong = async (id: string): Promise<Song> => (await library()).read(id)
export const createSong = async (): Promise<Song> => (await library()).create()

export async function writeSong(song: Song): Promise<Song> {
  const saved = await (await library()).write(song)
  /* A title change renames the directory, which changes the song's id. */
  const { lastSongId } = await readConfig()
  if (lastSongId === song.id && saved.id !== song.id) await updateConfig({ lastSongId: saved.id })
  return saved
}

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
  const directory = await songDirectory(songId)
  const existing = await readSong(songId)
  const channel = await importAudio({
    songDirectory: directory,
    sourcePath,
    takenIds: existing.channels.map((entry) => entry.id)
  })

  const song = await readSong(songId)
  return writeSong({ ...song, channels: [...song.channels, channel] })
}

/** Removes a channel and the files that belong only to it. */
export async function removeChannel(songId: string, channelId: string): Promise<Song> {
  const song = await readSong(songId)
  const channel = song.channels.find((entry) => entry.id === channelId)
  const directory = await songDirectory(songId)

  if (channel?.kind === 'audio') {
    await rm(join(directory, channel.file), { force: true })
    await rm(join(directory, 'peaks', `${channel.id}.peaks`), { force: true })
  }

  return writeSong({
    ...song,
    channels: song.channels.filter((entry) => entry.id !== channelId)
  })
}


/**
 * Reads a channel's audio for decoding in the renderer. The path comes from
 * song.json, which is editable by hand, so it is confined to the song's own
 * directory before anything is opened.
 */
export async function readChannelAudio(songId: string, file: string): Promise<Buffer> {
  const directory = await songDirectory(songId)
  const target = normalize(join(directory, file))
  const inside = relative(directory, target)
  if (inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error(`Refusing to read outside the song folder: "${file}"`)
  }
  return readFile(target)
}
