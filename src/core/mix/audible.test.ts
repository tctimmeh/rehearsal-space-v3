import { describe, expect, it } from 'vitest'

import type { Channel } from '../song/song'
import { anySoloed, audibleGain, isAudible } from './audible'

const audio = (id: string, state: Partial<Channel> = {}): Channel =>
  ({
    kind: 'audio',
    id,
    name: id,
    subject: 'other',
    file: `audio/${id}.ogg`,
    startTime: 0,
    duration: 10,
    gain: 0.8,
    muted: false,
    soloed: false,
    origin: { type: 'record' },
    ...state
  }) as Channel

const click = (id: string, state: Partial<Channel> = {}): Channel =>
  ({
    kind: 'metronome',
    id,
    name: id,
    subject: 'metronome',
    sample: 'woodblock',
    endTime: 0,
    accentFirstBeat: true,
    duration: { mode: 'measures', bpm: 120, measures: 1, beatsPerMeasure: 4 },
    gain: 0.5,
    muted: false,
    soloed: false,
    ...state
  }) as Channel

describe('isAudible', () => {
  it('plays everything when nothing is soloed', () => {
    const channels = [audio('a'), audio('b')]
    expect(channels.every((channel) => isAudible(channel, channels))).toBe(true)
  })

  it('plays only the soloed channels', () => {
    const channels = [audio('a', { soloed: true }), audio('b')]
    expect(isAudible(channels[0] as Channel, channels)).toBe(true)
    expect(isAudible(channels[1] as Channel, channels)).toBe(false)
  })

  it('plays every soloed channel, not just the first', () => {
    const channels = [audio('a', { soloed: true }), audio('b', { soloed: true }), audio('c')]
    expect(isAudible(channels[0] as Channel, channels)).toBe(true)
    expect(isAudible(channels[1] as Channel, channels)).toBe(true)
    expect(isAudible(channels[2] as Channel, channels)).toBe(false)
  })

  it('lets mute win over solo, even on the channel that is soloed', () => {
    const channels = [audio('a', { soloed: true, muted: true }), audio('b')]
    expect(isAudible(channels[0] as Channel, channels)).toBe(false)
    /* And the mix is still in solo, so the unsoloed channel stays silent:
       muting the only soloed channel means silence, not "solo off". */
    expect(isAudible(channels[1] as Channel, channels)).toBe(false)
  })

  it('mutes a channel whether or not anything is soloed', () => {
    const alone = [audio('a', { muted: true })]
    expect(isAudible(alone[0] as Channel, alone)).toBe(false)
  })

  it('does not let a metronome put the mix into solo, since it cannot be soloed', () => {
    /* Guards against a stray soloed flag on a channel whose solo button is dead. */
    const channels = [audio('a'), click('c', { soloed: true })]
    expect(anySoloed(channels)).toBe(false)
    expect(isAudible(channels[0] as Channel, channels)).toBe(true)
  })

  it('silences a metronome while another channel is soloed', () => {
    /* The spec is explicit: a soloed channel is the only one playing. */
    const channels = [audio('a', { soloed: true }), click('c')]
    expect(isAudible(channels[1] as Channel, channels)).toBe(false)
  })
})

describe('audibleGain', () => {
  it('is the fader when heard and nothing when not', () => {
    const channels = [audio('a', { gain: 0.42 }), audio('b', { soloed: true })]
    expect(audibleGain(channels[1] as Channel, channels)).toBe(0.8)
    expect(audibleGain(channels[0] as Channel, channels)).toBe(0)
  })
})
