import { describe, expect, it } from 'vitest'

import { audioFileStem } from './fileName'
import { uniqueSlug } from './slug'

describe('audioFileStem', () => {
  it('keeps the name the user gave the file', () => {
    expect(audioFileStem('/home/tim/Music/bass_take2.wav')).toBe('bass_take2')
    expect(audioFileStem('Comeback Season (full mix).mp3')).toBe('Comeback Season (full mix)')
  })

  it('removes anything that would confuse a filesystem', () => {
    expect(audioFileStem('a/b:c*d?.wav')).toBe('b c d')
    expect(audioFileStem('drums|kit<>.flac')).toBe('drums kit')
  })

  it('never produces a hidden file or a trailing dot', () => {
    expect(audioFileStem('/tmp/.hidden.wav')).toBe('hidden')
    expect(audioFileStem('trailing...wav')).toBe('trailing')
  })

  it('falls back when nothing usable is left', () => {
    expect(audioFileStem('/tmp/.wav')).toBe('audio')
    expect(audioFileStem('')).toBe('audio')
  })

  it('shortens a name a filesystem would refuse', () => {
    expect(audioFileStem(`${'x'.repeat(400)}.wav`).length).toBeLessThanOrEqual(80)
  })

  it('gives a second file of the same name its own number', () => {
    /* Importing the same take twice must not overwrite the first. */
    expect(uniqueSlug(audioFileStem('bass_take2.wav'), ['bass_take2'])).toBe('bass_take2-2')
  })
})
