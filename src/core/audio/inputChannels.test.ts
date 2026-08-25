import { describe, expect, it } from 'vitest'

import { ALL_INPUTS, inputOptions, pickInput } from './inputChannels'

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
