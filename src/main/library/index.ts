import type { Song, SongSummary } from '@core/song/song'
import { readConfig, updateConfig } from '../config'
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
