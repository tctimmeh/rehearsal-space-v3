import { beforeEach, describe, expect, it, vi } from 'vitest'

import { newSong, type AudioChannel, type Channel, type Song } from '@core/song/song'
import { useSong } from './song'
import { useTools } from './tools'
import { describeEdit, useWaveformEdit } from './waveformEdit'
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
  useWaveformEdit.setState({ editing: null, asking: null })
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

  it('does nothing when the same one is opened again', () => {
    useWaveformEdit.getState().begin('trim', take())
    const open = useWaveformEdit.getState().editing

    useWaveformEdit.getState().begin('trim', take())

    expect(useWaveformEdit.getState().editing).toBe(open)
    expect(useWaveformEdit.getState().asking).toBeNull()
  })
})

/**
 * Anything that would leave a session behind asks first. Neither answer can be
 * guessed from the asking: saving silently is how the old modes lost takes, and
 * throwing the work away silently is worse.
 */
describe('being asked what to do with the open one', () => {
  const openThenAskFor = (id: string) => {
    useWaveformEdit.getState().begin('trim', take())
    move(9)
    useWaveformEdit.getState().begin('trim', take({ id, startTime: 0 }))
  }

  it('asks rather than beginning another over the top', () => {
    openThenAskFor('other')

    expect(useWaveformEdit.getState().asking).not.toBeNull()
    expect(useWaveformEdit.getState().editing?.channelId).toBe('Take 1')
  })

  it('keeps the changes and goes on, when that is the answer', async () => {
    openThenAskFor('other')

    await useWaveformEdit.getState().saveAndGo()

    expect(channelNow().startTime).toBe(9)
    expect(useWaveformEdit.getState().editing?.channelId).toBe('other')
    expect(useWaveformEdit.getState().asking).toBeNull()
  })

  it('puts the channel back and goes on, when that is the answer', async () => {
    openThenAskFor('other')

    await useWaveformEdit.getState().discardAndGo()

    expect(channelNow().startTime).toBe(4)
    expect(useWaveformEdit.getState().editing?.channelId).toBe('other')
  })

  /* Pressing the wrong thing has to be survivable: nothing is decided and the
     session carries on where it was. */
  it('stays where it was, when that is the answer', () => {
    openThenAskFor('other')

    useWaveformEdit.getState().stay()

    expect(useWaveformEdit.getState().asking).toBeNull()
    expect(useWaveformEdit.getState().editing?.channelId).toBe('Take 1')
    expect(channelNow().startTime).toBe(9)
  })

  it('asks before anything else takes the stage from it', () => {
    const went = vi.fn()
    useWaveformEdit.getState().begin('trim', take())

    useWaveformEdit.getState().leaving(went)

    expect(went).not.toHaveBeenCalled()
    expect(useWaveformEdit.getState().asking).not.toBeNull()
  })

  it('lets it go straight through when there is no session to lose', () => {
    const went = vi.fn()

    useWaveformEdit.getState().leaving(went)

    expect(went).toHaveBeenCalledOnce()
    expect(useWaveformEdit.getState().asking).toBeNull()
  })

  it('goes where it was going once the question is answered', async () => {
    const went = vi.fn()
    useWaveformEdit.getState().begin('trim', take())
    useWaveformEdit.getState().leaving(went)

    await useWaveformEdit.getState().saveAndGo()

    expect(went).toHaveBeenCalledOnce()
    expect(useWaveformEdit.getState().editing).toBeNull()
  })
})

/* The stage says what is being done rather than what the tool is called. */
describe('what the stage calls it', () => {
  it('names the channel being trimmed', () => {
    const editing = { kind: 'trim' as const, channelId: 'Take 1', before: take() }

    expect(describeEdit(editing, [take({ name: 'Rhythm' })])).toBe('Trimming Rhythm')
  })

  it('names the click track being lined up', () => {
    const editing = { kind: 'click' as const, channelId: 'Take 1', before: take() }

    expect(describeEdit(editing, [take({ name: 'Count-in' })])).toBe('Lining up Count-in')
  })

  /* A channel deleted from under a session still has to be called something. */
  it('falls back to what it was called when the session opened', () => {
    const editing = { kind: 'trim' as const, channelId: 'Take 1', before: take({ name: 'Gone' }) }

    expect(describeEdit(editing, [])).toBe('Trimming Gone')
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
