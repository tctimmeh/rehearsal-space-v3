import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createLibrary, type SongLibrary } from './library'

let root: string
let library: SongLibrary

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'rehearsal-library-'))
  library = createLibrary(root)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const directories = async (): Promise<string[]> => (await readdir(root)).sort()

describe('createLibrary', () => {
  it('creates a song in its own directory with a readable song.json', async () => {
    const song = await library.create()

    expect(song.id).toBe('new-song')
    expect(song.title).toBe('New Song')
    expect(await directories()).toEqual(['new-song'])

    const onDisk = JSON.parse(await readFile(join(root, 'new-song', 'song.json'), 'utf8'))
    expect(onDisk.title).toBe('New Song')
  })

  it('gives each new song its own directory, since they all start as "New Song"', async () => {
    await library.create()
    await library.create()
    expect(await directories()).toEqual(['new-song', 'new-song-2'])
  })

  it('renames the directory when the title changes, so the folder stays browsable', async () => {
    const song = await library.create()
    const saved = await library.write({ ...song, title: 'Comeback Season' })

    expect(saved.id).toBe('comeback-season')
    expect(await directories()).toEqual(['comeback-season'])
  })

  it('carries the song’s files along when the directory is renamed', async () => {
    const song = await library.create()
    await mkdir(join(root, song.id, 'audio'), { recursive: true })
    await writeFile(join(root, song.id, 'audio', 'vocals.ogg'), 'not really audio')

    const saved = await library.write({ ...song, title: 'Coast Road' })

    expect(await readFile(join(root, saved.id, 'audio', 'vocals.ogg'), 'utf8')).toBe(
      'not really audio'
    )
  })

  it('does not collide with an existing directory when renaming', async () => {
    const first = await library.create()
    await library.write({ ...first, title: 'Coast Road' })
    const second = await library.create()

    const saved = await library.write({ ...second, title: 'Coast Road' })

    expect(saved.id).toBe('coast-road-2')
    expect(await directories()).toEqual(['coast-road', 'coast-road-2'])
  })

  it('leaves the directory alone when the title changes but the slug does not', async () => {
    const song = await library.create()
    const renamed = await library.write({ ...song, title: 'Coast Road' })
    const saved = await library.write({ ...renamed, title: 'Coast  Road!' })

    expect(saved.id).toBe('coast-road')
    expect(await directories()).toEqual(['coast-road'])
  })

  it('reads back what it wrote', async () => {
    const song = await library.create()
    await library.write({ ...song, artist: 'The Lowlifes', buses: { music: 0.5, click: 0.25 } })

    const reloaded = await library.read(song.id)
    expect(reloaded.artist).toBe('The Lowlifes')
    expect(reloaded.buses).toEqual({ music: 0.5, click: 0.25 })
  })

  it('lists songs with their channel count and whether lyrics exist', async () => {
    const song = await library.create()
    await writeFile(join(root, song.id, 'lyrics.txt'), 'Counted every mile')

    const [summary] = await library.list()
    expect(summary).toMatchObject({ id: 'new-song', channelCount: 0, hasLyrics: true })
  })

  it('still lists a song whose song.json is corrupt, so it can be deleted', async () => {
    await library.create()
    await writeFile(join(root, 'new-song', 'song.json'), '{ this is not json')

    const [summary] = await library.list()
    expect(summary?.id).toBe('new-song')
  })

  it('ignores directories that are not songs', async () => {
    await mkdir(join(root, '.git'), { recursive: true })
    await library.create()
    expect(await library.list()).toHaveLength(1)
  })

  it('removes the whole song directory', async () => {
    const song = await library.create()
    await mkdir(join(root, song.id, 'audio'), { recursive: true })
    await writeFile(join(root, song.id, 'audio', 'vocals.ogg'), 'audio')

    await library.remove(song.id)
    expect(await directories()).toEqual([])
  })

  it('refuses ids that would escape the library directory', async () => {
    await expect(library.read('../../etc')).rejects.toThrow(/unsafe song id/)
    await expect(library.remove('..')).rejects.toThrow(/unsafe song id/)
  })
})
