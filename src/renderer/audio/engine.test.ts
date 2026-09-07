import { beforeEach, describe, expect, it, vi } from 'vitest'

import { newSong, type AudioChannel, type Song } from '@core/song/song'

/**
 * Enough of the Web Audio API for loading: gains that can be connected and
 * ramped, and a decoder that hands back something we can recognise again.
 */
const param = () => ({
  value: 1,
  cancelScheduledValues: vi.fn(),
  setTargetAtTime: vi.fn(),
  setValueAtTime: vi.fn()
})

const node = () => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() })

/** What was decoded, kept as the "buffer" so it can be identified later. */
const decodedFrom = (bytes: ArrayBuffer): unknown => ({
  duration: 1,
  sampleRate: 44100,
  said: new TextDecoder().decode(bytes)
})

class StubContext {
  currentTime = 0
  state = 'running'
  destination = node()
  createGain = () => node()
  createDelay = () => ({ ...node(), delayTime: param() })
  createBufferSource = () => ({
    ...node(),
    buffer: null,
    playbackRate: param(),
    start: vi.fn(),
    stop: vi.fn()
  })
  decodeAudioData = async (bytes: ArrayBuffer) => decodedFrom(bytes)
  close = vi.fn(async () => undefined)
  resume = vi.fn(async () => undefined)
}

const take = (id: string, name: string, file: string): AudioChannel =>
  ({
    kind: 'audio',
    id,
    name,
    subject: 'other',
    file,
    startTime: 0,
    duration: 10,
    sourceDuration: 10,
    gain: 1,
    muted: false,
    soloed: false,
    origin: { type: 'record' }
  }) as AudioChannel

const songWith = (id: string, channel: AudioChannel): Song => ({
  ...newSong(id),
  id,
  channels: [channel]
})

/** The bytes each song's file would hand back: its own name, so they differ. */
const reading = (song: string) => async (file: string) =>
  new TextEncoder().encode(`${song}/${file}`)

async function freshEngine() {
  vi.resetModules()
  vi.stubGlobal('AudioContext', StubContext)
  vi.stubGlobal('window', { rehearsal: {} })
  const { AudioEngine } = await import('./engine')
  return new AudioEngine()
}

/** What each loaded channel is actually holding, by channel id. */
const holding = (engine: unknown): Record<string, string> => {
  const channels = (engine as { channels: Map<string, { buffer: { said: string } }> }).channels
  return Object.fromEntries([...channels].map(([id, one]) => [id, one.buffer.said]))
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

/**
 * A channel id is unique inside its song and nowhere else. Every song's first
 * recording is named "Take 1" and so every one of them has the same id — so
 * two songs sharing an id is the ordinary case, not a freak one.
 */
describe('loading one song after another', () => {
  it('decodes the second song rather than keeping the first', async () => {
    const engine = await freshEngine()
    const first = songWith('riot-sirens', take('Take 1', 'Rhythm', 'audio/Take 1.ogg'))
    const second = songWith('long-ago', take('Take 1', 'Take 1', 'audio/Take 1.ogg'))

    await engine.load(first, reading('riot-sirens'))
    expect(holding(engine)).toEqual({ 'Take 1': 'riot-sirens/audio/Take 1.ogg' })

    await engine.load(second, reading('long-ago'))

    expect(holding(engine)).toEqual({ 'Take 1': 'long-ago/audio/Take 1.ogg' })
  })

  /* And back again, which is how it was found: each song played the other. */
  it('follows the song both ways round', async () => {
    const engine = await freshEngine()
    const first = songWith('riot-sirens', take('Take 1', 'Rhythm', 'audio/Take 1.ogg'))
    const second = songWith('long-ago', take('Take 1', 'Take 1', 'audio/Take 1.ogg'))
    const held: string[] = []

    for (const [song, name] of [
      [first, 'riot-sirens'],
      [second, 'long-ago'],
      [first, 'riot-sirens']
    ] as const) {
      await engine.load(song, reading(name))
      held.push(holding(engine)['Take 1'] as string)
    }

    expect(held).toEqual([
      'riot-sirens/audio/Take 1.ogg',
      'long-ago/audio/Take 1.ogg',
      'riot-sirens/audio/Take 1.ogg'
    ])
  })

  /* The reuse is worth having within one song: adding a channel must not send
     the app back to the disk for everything already decoded. */
  it('keeps what it has when the same song is loaded again', async () => {
    const engine = await freshEngine()
    const one = take('Take 1', 'Rhythm', 'audio/Take 1.ogg')
    const two = take('gtr', 'Guitar', 'audio/gtr.ogg')
    const read = vi.fn(reading('riot-sirens'))

    await engine.load(songWith('riot-sirens', one), read)
    read.mockClear()
    await engine.load({ ...songWith('riot-sirens', one), channels: [one, two] }, read)

    expect(read.mock.calls.map((call) => call[0])).toEqual(['audio/gtr.ogg'])
    expect(holding(engine)).toEqual({
      'Take 1': 'riot-sirens/audio/Take 1.ogg',
      gtr: 'riot-sirens/audio/gtr.ogg'
    })
  })

  it('lets go of a channel the song no longer has', async () => {
    const engine = await freshEngine()
    const one = take('Take 1', 'Rhythm', 'audio/Take 1.ogg')
    const two = take('gtr', 'Guitar', 'audio/gtr.ogg')
    const song = songWith('riot-sirens', one)

    await engine.load({ ...song, channels: [one, two] }, reading('riot-sirens'))
    await engine.load(song, reading('riot-sirens'))

    expect(Object.keys(holding(engine))).toEqual(['Take 1'])
  })
})
