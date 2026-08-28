import { describe, expect, it } from 'vitest'

import {
  ALL_INPUTS,
  channelName,
  inputsWorthKeeping,
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
 * A two-socket interface arrives as one stereo stream, and taking it "as it
 * comes" used to write both sides into one channel: a guitar in the first
 * socket and a voice in the second came out hard left and hard right. They are
 * two things being played, so they become two channels — and a socket with
 * nothing in it becomes nothing at all.
 */
describe('which inputs are worth keeping', () => {
  const tone = (peak: number, length = 64) =>
    Float32Array.from({ length }, (_, i) => peak * Math.sin(i))

  const silence = (length = 64) => new Float32Array(length)

  it('keeps the one that was played', () => {
    expect(inputsWorthKeeping([tone(0.5), silence()])).toEqual([0])
  })

  it('does not mind which socket that was', () => {
    expect(inputsWorthKeeping([silence(), tone(0.5)])).toEqual([1])
  })

  it('keeps both when both were played', () => {
    expect(inputsWorthKeeping([tone(0.5), tone(0.2)])).toEqual([0, 1])
  })

  /* A voice further from its microphone than a guitar is from its lead is
     still a voice, and losing it would be far worse than an idle channel. */
  it('keeps a part that is merely much quieter than the other', () => {
    expect(inputsWorthKeeping([tone(0.6), tone(0.02)])).toEqual([0, 1])
  })

  /* What an unused input reads depends on the interface and on whether its
     preamp is live at all, so it is judged against the socket beside it. */
  it('keeps an open microphone hearing a quiet room', () => {
    expect(inputsWorthKeeping([tone(0.5), tone(0.006)])).toEqual([0, 1])
  })

  it('drops a socket that is silent beside a loud one', () => {
    expect(inputsWorthKeeping([tone(0.5), tone(0.0004)])).toEqual([0])
  })

  it('answers a take of nothing with all of it, for the caller to complain', () => {
    expect(inputsWorthKeeping([silence(), silence()])).toEqual([0, 1])
  })
})
