import { beforeEach, describe, expect, it, vi } from 'vitest'

import { newSong, type AudioChannel, type Channel, type Song } from '@core/song/song'
import { useSong } from './song'
import { useTools } from './tools'
import { useWaveformEdit } from './waveformEdit'
import { useWaveformView } from './waveformView'

const take = (patch: Partial<AudioChannel> = {}): Channel =>
  ({
    kind: 'audio',
    id: 'Take 1',
    name: 'Take 1',
    subject: 'other',
    file: 'audio/Take 1.ogg',
    startTime: 4,
    duration: 10,
    gain: 1,
    muted: false,
    soloed: false,
    origin: { type: 'record' },
    ...patch
  }) as Channel

const songWith = (channel: Channel): Song => ({
  ...newSong('a-song'),
  id: 'a-song',
  channels: [channel]
})

/** The channel as the song now has it. */
const channelNow = () => useSong.getState().song?.channels[0] as AudioChannel

const flushed = vi.fn(async () => undefined)

beforeEach(() => {
  flushed.mockClear()
  useWaveformEdit.setState({ editing: null })
  useWaveformView.setState({ windows: {} })
  useTools.setState({ open: { ...useTools.getState().open, waveform: false } })
  useSong.setState({
    song: songWith(take()),
    flush: flushed,
    update: (patch) => {
      useSong.setState((state) => ({ song: { ...(state.song as Song), ...patch } }))
    }
  })
})

const move = (startTime: number) => {
  const song = useSong.getState().song as Song
  useSong.getState().update({
    channels: song.channels.map((one) => ({ ...one, startTime }) as Channel)
  })
}

/**
 * Trimming and lining up used to be modes of the waveform tool that wrote every
 * drag straight into the song. What that cost is easiest to say backwards: a
 * tool left on trim turns a drag meant to look at the music into a channel
 * moved out of time with everything else, and nothing puts it back.
 */
describe('a session of trimming or lining up', () => {
  it('opens the tool it is done in', () => {
    useWaveformEdit.getState().begin('trim', take())

    expect(useTools.getState().open.waveform).toBe(true)
  })

  /* Opened to be worked on, so the view goes to it rather than leaving it a
     speck in a view of the whole song. */
  it('takes the view to the channel it is for', () => {
    useWaveformEdit.getState().begin('trim', take({ startTime: 42 }))

    expect(useWaveformView.getState().windows['a-song']?.centre).toBe(42)
  })

  /* A click track is anchored at its end — where the music picks the beat back
     up — so that, and not its start, is what there is to look at. */
  it('takes the view to where a click track ends', () => {
    const click = { ...take(), kind: 'metronome', endTime: 12, startTime: 9 } as Channel
    useWaveformEdit.getState().begin('click', click)

    expect(useWaveformView.getState().windows['a-song']?.centre).toBe(12)
  })

  it('will not begin a second one over the top of the first', () => {
    useWaveformEdit.getState().begin('trim', take())
    useWaveformEdit.getState().begin('click', take({ id: 'other' }))

    expect(useWaveformEdit.getState().editing?.channelId).toBe('Take 1')
  })
})

describe('agreeing to what was done', () => {
  it('keeps the changes and closes', async () => {
    useWaveformEdit.getState().begin('trim', take())
    move(9)

    await useWaveformEdit.getState().save()

    expect(channelNow().startTime).toBe(9)
    expect(useWaveformEdit.getState().editing).toBeNull()
  })

  /* Saving is the moment it becomes the song's, so it does not wait for the
     next thing that happens to write it down. */
  it('writes it out rather than leaving it to the timer', async () => {
    useWaveformEdit.getState().begin('trim', take())
    move(9)

    await useWaveformEdit.getState().save()

    expect(flushed).toHaveBeenCalled()
  })
})

describe('throwing away what was done', () => {
  it('puts the channel back as it was', async () => {
    useWaveformEdit.getState().begin('trim', take())
    move(9)

    await useWaveformEdit.getState().cancel()

    expect(channelNow().startTime).toBe(4)
    expect(useWaveformEdit.getState().editing).toBeNull()
  })

  /* Trimming changes three things at once, and putting back only the one that
     was watched would leave a channel nobody asked for. */
  it('puts back everything the session touched, not only where it starts', async () => {
    useWaveformEdit.getState().begin('trim', take())
    const song = useSong.getState().song as Song
    useSong.getState().update({
      channels: song.channels.map(
        (one) => ({ ...one, startTime: 9, duration: 2, offset: 3 }) as Channel
      )
    })

    await useWaveformEdit.getState().cancel()

    expect(channelNow()).toEqual(take())
  })

  it('leaves the other channels alone', async () => {
    const other = take({ id: 'other', name: 'Guitar', startTime: 0 })
    useSong.setState({ song: { ...songWith(take()), channels: [take(), other] } })
    useWaveformEdit.getState().begin('trim', take())
    const song = useSong.getState().song as Song
    useSong.getState().update({
      channels: song.channels.map((one) => ({ ...one, startTime: 9 }) as Channel)
    })

    await useWaveformEdit.getState().cancel()

    expect((useSong.getState().song as Song).channels[1]).toEqual({ ...other, startTime: 9 })
  })

  it('does nothing when there is no session to cancel', async () => {
    move(9)

    await useWaveformEdit.getState().cancel()

    expect(channelNow().startTime).toBe(9)
  })
})
