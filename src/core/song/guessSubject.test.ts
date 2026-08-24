import { describe, expect, it } from 'vitest'

import { guessSubject, nameFromFile } from './guessSubject'

describe('guessSubject', () => {
  it('recognises the names demucs gives its stems', () => {
    expect(guessSubject('vocals.wav')).toBe('vocals')
    expect(guessSubject('drums.wav')).toBe('drums')
    expect(guessSubject('bass.wav')).toBe('bass')
    expect(guessSubject('piano.wav')).toBe('piano')
    expect(guessSubject('guitar.wav')).toBe('guitar')
    expect(guessSubject('other.wav')).toBe('other')
  })

  it('prefers the more specific guitar when both could match', () => {
    expect(guessSubject('electric guitar take 2.wav')).toBe('electric')
    expect(guessSubject('acoustic-guitar.flac')).toBe('acoustic')
    expect(guessSubject('gtr_l.ogg')).toBe('guitar')
  })

  it('reads the abbreviations people actually type', () => {
    expect(guessSubject('lead_vox_final.wav')).toBe('vocals')
    expect(guessSubject('el-gtr-01.wav')).toBe('electric')
    expect(guessSubject('kick_in.wav')).toBe('drums')
  })

  it('recognises a full mix', () => {
    expect(guessSubject('Comeback Season (full mix).mp3')).toBe('music')
    expect(guessSubject('master.wav')).toBe('music')
  })

  it('ignores the path and the extension', () => {
    expect(guessSubject('/home/tim/Music/session/drums.aiff')).toBe('drums')
  })

  it('falls back rather than guessing wildly', () => {
    expect(guessSubject('take 4.wav')).toBe('other')
    expect(guessSubject('')).toBe('other')
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
