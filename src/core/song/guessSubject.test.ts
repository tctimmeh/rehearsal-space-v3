import { describe, expect, it } from 'vitest'

import { guessSubject, nameFromFile } from './guessSubject'

describe('guessSubject', () => {
  it('recognises the names demucs gives its stems', () => {
    expect(guessSubject('vocals.wav')).toBe('vocals')
    expect(guessSubject('drums.wav')).toBe('drums')
    expect(guessSubject('bass.wav')).toBe('bass')
    expect(guessSubject('piano.wav')).toBe('piano')
    expect(guessSubject('guitar.wav')).toBe('guitar')
    /* The catch-all stem, which must not be taken for the full mix. */
    expect(guessSubject('other.wav')).toBe('other')
  })

  /* An acoustic is worth telling apart from a guitar; an electric is not one
     of those, it is the guitar. */
  it('prefers the more specific guitar when both could match', () => {
    expect(guessSubject('acoustic-guitar.flac')).toBe('acoustic')
    expect(guessSubject('gtr_l.ogg')).toBe('guitar')
  })

  it('takes an electric guitar for a guitar', () => {
    expect(guessSubject('electric guitar take 2.wav')).toBe('guitar')
    expect(guessSubject('gtr_dist_crunch.wav')).toBe('guitar')
  })

  it('reads the abbreviations people actually type', () => {
    expect(guessSubject('lead_vox_final.wav')).toBe('vocals')
    expect(guessSubject('el-gtr-01.wav')).toBe('guitar')
    expect(guessSubject('kick_in.wav')).toBe('drums')
  })

  it('recognises a full mix', () => {
    expect(guessSubject('Comeback Season (full mix).mp3')).toBe('music')
    expect(guessSubject('master.wav')).toBe('music')
  })

  it('ignores the path and the extension', () => {
    expect(guessSubject('/home/tim/Music/session/drums.aiff')).toBe('drums')
  })

  it('assumes a full mix when the name gives nothing away', () => {
    expect(guessSubject('take 4.wav')).toBe('music')
    expect(guessSubject('')).toBe('music')
  })

  it('never guesses a kind of channel that is not an instrument', () => {
    /* A click track is audio like any other — but not the full mix. */
    expect(guessSubject('click_track.wav')).toBe('other')
    expect(guessSubject('count-in.wav')).toBe('other')
  })
})

describe('nameFromFile', () => {
  it('makes a readable channel name', () => {
    expect(nameFromFile('/tmp/bass_take2.wav')).toBe('Bass take2')
    expect(nameFromFile('el-gtr-01.ogg')).toBe('El gtr 01')
  })

  it('copes with a file that is all extension', () => {
    expect(nameFromFile('/tmp/.wav')).toBe('Audio')
  })
})
