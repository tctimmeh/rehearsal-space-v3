import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Song } from '@core/song/song'
import { createLibrary, insideSong, writeAtomically, type SongLibrary } from './library'

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

  /*
   * Importing, downloading and separating hand absolute paths to ffmpeg, and
   * those paths stop being true the moment the directory moves: the
   * conversion writes the file and the pass that reads it back finds nothing
   * there. Naming a song while it is still converting is the ordinary way to
   * meet that.
   */
  it('leaves the directory where it is while work is under way in it', async () => {
    const working = new Set<string>()
    const busyLibrary = createLibrary(root, { heldStill: (id) => working.has(id) })
    const song = await busyLibrary.create()
    working.add(song.id)

    const saved = await busyLibrary.write({ ...song, title: 'Jailbreak' })

    expect(saved.id).toBe(song.id)
    expect(await directories()).toEqual([song.id])

    /* And it catches up the next time the song is written. */
    working.delete(song.id)
    const later = await busyLibrary.write({ ...saved, title: 'Jailbreak' })
    expect(later.id).toBe('jailbreak')
    expect(await directories()).toEqual(['jailbreak'])
  })

  /* Held one song at a time: naming a song while another is importing is
     nobody's business but that song's. */
  it('still renames a song that nothing is happening to', async () => {
    const importing = await createLibrary(root).create()
    const busyLibrary = createLibrary(root, { heldStill: (id) => id === importing.id })
    const other = await busyLibrary.write({ ...importing, id: 'other', title: 'Other' })

    const saved = await busyLibrary.write({ ...other, title: 'Coast Road' })

    expect(saved.id).toBe('coast-road')
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

describe('writeAtomically', () => {
  it('survives two writes to the same file at once', async () => {
    /* Every write used one temp name per process, so concurrent writes shared
       it: the first rename moved it away and the second failed with ENOENT.
       Nothing was lost — the target had already been replaced — but the caller
       saw an error for work that had in fact succeeded. */
    const target = join(root, 'config.json')

    await Promise.all([
      writeAtomically(target, '{"a":1}\n'),
      writeAtomically(target, '{"a":2}\n'),
      writeAtomically(target, '{"a":3}\n')
    ])

    /* One of them won, and it is a whole file rather than a torn one. */
    expect(JSON.parse(await readFile(target, 'utf8'))).toHaveProperty('a')
  })

  it('leaves no temporary files behind', async () => {
    const target = join(root, 'song.json')
    await Promise.all(
      Array.from({ length: 8 }, (_, index) => writeAtomically(target, `{"n":${index}}\n`))
    )
    expect((await readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })
})

/**
 * Every path that reaches the filesystem came from song.json, which is a plain
 * file the user can edit and which travels with a song somebody else may have
 * sent. A channel or a tab file that climbs out of its own folder should read
 * nothing at all.
 */
describe('staying inside a song folder', () => {
  const song = '/library/a-song'

  it('resolves an ordinary file', () => {
    expect(insideSong(song, 'tabs/lead.txt')).toBe('/library/a-song/tabs/lead.txt')
  })

  it('refuses a path that climbs out', () => {
    expect(() => insideSong(song, '../another-song/song.json')).toThrow(/outside the song folder/)
  })

  it('refuses one that climbs out and back in', () => {
    expect(() => insideSong(song, 'tabs/../../../.ssh/id_rsa')).toThrow(/outside/)
  })

  it('refuses an absolute path', () => {
    expect(() => insideSong(song, '/etc/passwd')).toThrow(/outside/)
  })
})

/**
 * A channel's audio file is the thing that gets dragged into a DAW, so it
 * carries the channel's name rather than whatever the file was called when it
 * arrived — every recording arrives as "Take 1".
 */
describe('naming a channel names its file', () => {
  const audioIn = async (id: string): Promise<string[]> =>
    (await readdir(join(root, id, 'audio')).catch(() => [])).sort()

  const withTake = async (name: string, file = 'audio/Take 1.ogg') => {
    const song = await library.create()
    await mkdir(join(root, song.id, 'audio'), { recursive: true })
    await writeFile(join(root, song.id, file), 'the take itself')
    return {
      ...song,
      channels: [
        {
          kind: 'audio',
          id: 'Take 1',
          name,
          subject: 'other',
          file,
          startTime: 0,
          duration: 10,
          gain: 1,
          muted: false,
          soloed: false,
          origin: { type: 'record' }
        }
      ]
    } as Song
  }

  it('renames the file when the channel is renamed', async () => {
    const saved = await library.write(await withTake('Rhythm'))

    expect(await audioIn(saved.id)).toEqual(['Rhythm.ogg'])
    expect(saved.channels[0]?.kind === 'audio' && saved.channels[0].file).toBe('audio/Rhythm.ogg')
    /* The take itself, moved rather than made again. */
    expect(await readFile(join(root, saved.id, 'audio', 'Rhythm.ogg'), 'utf8')).toBe(
      'the take itself'
    )
  })

  /* Everything else in the song points at the id, and the waveform beside a
     channel is filed under it. */
  it('leaves the channel id alone', async () => {
    const saved = await library.write(await withTake('Rhythm'))

    expect(saved.channels[0]?.id).toBe('Take 1')
  })

  it('does nothing when the name already matches', async () => {
    const song = await withTake('Take 1')
    const saved = await library.write(song)

    expect(await audioIn(saved.id)).toEqual(['Take 1.ogg'])
  })

  it('keeps the extension the file arrived with', async () => {
    const saved = await library.write(await withTake('Rhythm', 'audio/Take 1.wav'))

    expect(await audioIn(saved.id)).toEqual(['Rhythm.wav'])
  })

  /* Two channels may be called the same thing; two files may not. */
  it('does not take a name another file already has', async () => {
    const song = await withTake('Rhythm')
    await writeFile(join(root, song.id, 'audio', 'Rhythm.ogg'), 'something else')

    const saved = await library.write(song)

    expect(await audioIn(saved.id)).toEqual(['Rhythm-2.ogg', 'Rhythm.ogg'])
    expect(saved.channels[0]?.kind === 'audio' && saved.channels[0].file).toBe(
      'audio/Rhythm-2.ogg'
    )
  })

  it('drops what a filesystem will not hold, and keeps the rest of the name', async () => {
    const saved = await library.write(await withTake('AC/DC riff: take 2'))

    expect(await audioIn(saved.id)).toEqual(['AC DC riff take 2.ogg'])
  })

  /* A name is not worth losing a take for. */
  it('leaves the channel pointing at the file it has when the rename fails', async () => {
    const song = await withTake('Rhythm', 'audio/gone.ogg')
    await rm(join(root, song.id, 'audio', 'gone.ogg'))

    const saved = await library.write(song)

    expect(saved.channels[0]?.kind === 'audio' && saved.channels[0].file).toBe('audio/gone.ogg')
  })

  /* Anything running holds absolute paths into the song, exactly as with the
     directory rename. */
  it('leaves files where they are while work is under way in the song', async () => {
    const holding = createLibrary(root, { heldStill: () => true })
    const song = await withTake('Rhythm')

    const saved = await holding.write(song)

    expect(await audioIn(saved.id)).toEqual(['Take 1.ogg'])
  })
})
