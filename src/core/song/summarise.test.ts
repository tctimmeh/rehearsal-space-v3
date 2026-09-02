import { describe, expect, it } from 'vitest'

import { newSong, summarise, type Channel, type Song } from './song'

const withChannels = (...channels: Channel[]): Song => ({ ...newSong('a-song'), channels })

const audio = (id: string): Channel =>
  ({
    id,
    kind: 'audio',
    name: 'Take',
    subject: 'guitar',
    gain: 0,
    muted: false,
    soloed: false,
    file: `audio/${id}.ogg`,
    startTime: 0,
    duration: 30,
    origin: { type: 'record' }
  }) as Channel

const click = (): Channel =>
  ({
    id: 'click',
    kind: 'metronome',
    name: 'Count-in',
    subject: 'metronome',
    gain: 0,
    muted: false,
    soloed: false,
    sample: 'beep',
    bpm: 100,
    beatsPerMeasure: 4,
    startTime: -4,
    endTime: 0,
    accentFirstBeat: true
  }) as Channel

/* The library lists names; what is in each of them is the other half of it. */
describe('what a song holds', () => {
  it('has audio once something has been recorded or imported', () => {
    expect(summarise(withChannels(audio('c1')), false).hasAudio).toBe(true)
  })

  it('has none in a song with nothing in it', () => {
    expect(summarise(newSong('a-song'), false).hasAudio).toBe(false)
  })

  /* A click track is not a recording of anything, so a song with only one has
     nothing in it yet. */
  it('does not count a click track as audio', () => {
    expect(summarise(withChannels(click()), false).hasAudio).toBe(false)
    expect(summarise(withChannels(click(), audio('c1')), false).hasAudio).toBe(true)
  })

  it('has tablature once a file has been started', () => {
    const song = { ...newSong('a-song'), tabs: [{ id: 't', file: 'tabs/t.txt', name: 'Lead', strings: 6 }] }

    expect(summarise(song, false).hasTabs).toBe(true)
    expect(summarise(newSong('a-song'), false).hasTabs).toBe(false)
  })

  /* Lyrics live in a file of their own, so whether there are any is something
     only the library can see. */
  it('takes whether there are lyrics from whoever looked', () => {
    expect(summarise(newSong('a-song'), true).hasLyrics).toBe(true)
    expect(summarise(newSong('a-song'), false).hasLyrics).toBe(false)
  })

  it('still counts the channels, click track and all', () => {
    expect(summarise(withChannels(click(), audio('c1')), false).channelCount).toBe(2)
  })
})
