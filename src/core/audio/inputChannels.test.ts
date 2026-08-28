import { describe, expect, it } from 'vitest'

import {
  ALL_INPUTS,
  channelName,
  dropSilentInputs,
  inputOptions,
  pickInput
} from './inputChannels'

const guitar = Float32Array.from([1, 1, 1])
const microphone = Float32Array.from([2, 2, 2])

describe('pickInput', () => {
  it('takes the socket the instrument is plugged into', () => {
    /* A two-input interface arrives as one stereo stream. */
    expect(pickInput([guitar, microphone], 1)).toEqual([guitar])
    expect(pickInput([guitar, microphone], 2)).toEqual([microphone])
  })

  it('gives a mono take, not one thing hard left and another hard right', () => {
    expect(pickInput([guitar, microphone], 2)).toHaveLength(1)
  })

  it('keeps everything when that is what was asked for', () => {
    expect(pickInput([guitar, microphone], ALL_INPUTS)).toEqual([guitar, microphone])
  })

  it('falls back to the first input rather than recording silence', () => {
    /* The chosen device was swapped for one with fewer sockets. */
    expect(pickInput([guitar], 2)).toEqual([guitar])
  })

  it('copes with a capture that produced nothing', () => {
    expect(pickInput([], 1)).toEqual([])
  })
})

describe('inputOptions', () => {
  it('does not ask which channel to use when there is only one', () => {
    expect(inputOptions(1)).toEqual([{ value: ALL_INPUTS, label: 'The only channel' }])
    expect(inputOptions(0)).toHaveLength(1)
  })

  it('names a stereo pair after the stream, not after sockets it cannot count', () => {
    expect(inputOptions(2).map((option) => option.label)).toEqual([
      'Both together',
      'Left only',
      'Right only'
    ])
  })

  it('leads with taking the device as it comes, which is the usual case', () => {
    expect(inputOptions(2)[0]?.value).toBe(ALL_INPUTS)
    expect(inputOptions(8)[0]?.value).toBe(ALL_INPUTS)
  })

  it('scales to an interface with more channels', () => {
    expect(inputOptions(8)).toHaveLength(9)
    expect(inputOptions(8).at(-1)?.label).toBe('Channel 8 only')
  })
})

describe('channelName', () => {
  it('calls a stereo pair left and right', () => {
    expect(channelName(0, 2)).toBe('Left')
    expect(channelName(1, 2)).toBe('Right')
  })

  it('numbers anything wider, since sockets cannot be known', () => {
    expect(channelName(2, 4)).toBe('Channel 3')
  })

  it('agrees with what the picker offers', () => {
    const labels = inputOptions(2).map((option) => option.label)
    expect(labels).toContain(`${channelName(0, 2)} only`)
    expect(labels).toContain(`${channelName(1, 2)} only`)
  })
})

/**
 * A two-socket interface arrives as one stereo stream, so taking it "as it
 * comes" with a guitar in the first socket alone gives a take that is hard
 * left and silent on the right. Measured from a real one: the played channel
 * peaked at -3 dBFS and the empty socket at -64.
 */
describe('inputs with nothing plugged into them', () => {
  const tone = (peak: number, length = 64) =>
    Float32Array.from({ length }, (_, i) => peak * Math.sin(i))

  const silence = (length = 64) => new Float32Array(length)

  it('are dropped, so a lone guitar records as mono', () => {
    expect(dropSilentInputs([tone(0.5), silence()])).toHaveLength(1)
  })

  it('are dropped whichever socket they are', () => {
    const guitar = tone(0.5)
    expect(dropSilentInputs([silence(), guitar])).toEqual([guitar])
  })

  it('leave a genuinely two-sided take alone', () => {
    expect(dropSilentInputs([tone(0.5), tone(0.2)])).toHaveLength(2)
  })

  /* Quiet is not the same as empty: a distant microphone is still a take. */
  it('keep a channel that is merely quiet', () => {
    expect(dropSilentInputs([tone(0.5), tone(0.02)])).toHaveLength(2)
  })

  it('keep the interface\'s own noise rather than nothing at all', () => {
    const hiss = tone(0.0002)
    expect(dropSilentInputs([hiss])).toEqual([hiss])
  })

  it('leave a take of nothing alone, for the caller to complain about', () => {
    expect(dropSilentInputs([silence(), silence()])).toHaveLength(2)
  })
})
