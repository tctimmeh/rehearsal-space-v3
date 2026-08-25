import { describe, expect, it } from 'vitest'

import { prettyChord, prettyDegree, writableChord, writableNote } from './spelling'

describe('prettyChord', () => {
  it('turns accidentals into the signs they are', () => {
    expect(prettyChord('Bb')).toBe('B♭')
    expect(prettyChord('F#m7')).toBe('F♯m7')
    expect(prettyChord('Ab/C')).toBe('A♭/C')
  })

  it('leaves a B alone, which a blunter replacement does not', () => {
    expect(prettyChord('Bm7b5')).toBe('Bm7♭5')
    expect(prettyChord('Bdim')).toBe('Bdim')
    expect(prettyChord('B')).toBe('B')
  })

  it('flattens an altered degree wherever it appears', () => {
    expect(prettyChord('C7b9')).toBe('C7♭9')
    expect(prettyChord('Ebm7b5')).toBe('E♭m7♭5')
  })

  it('leaves the letters of a chord name alone', () => {
    expect(prettyChord('Cadd9')).toBe('Cadd9')
    expect(prettyChord('Absus4')).toBe('A♭sus4')
  })
})

describe('prettyDegree', () => {
  it('flattens a degree that is flattened', () => {
    expect(prettyDegree('bVII')).toBe('♭VII')
    expect(prettyDegree('bIII')).toBe('♭III')
  })

  it('leaves the rest as they are', () => {
    expect(prettyDegree('IV')).toBe('IV')
    expect(prettyDegree('vii°')).toBe('vii°')
    expect(prettyDegree('i')).toBe('i')
  })
})

/**
 * The rule the lyrics editor transposes by, so a chart and the song beside it
 * never disagree about what a chord is called.
 */
describe('writableNote', () => {
  it('swaps the names no chart has ever said', () => {
    expect(writableNote('Cb')).toBe('B')
    expect(writableNote('E#')).toBe('F')
    expect(writableNote('B#')).toBe('C')
    expect(writableNote('Fb')).toBe('E')
  })

  it('swaps a double accidental for the note it means', () => {
    expect(writableNote('Ebb')).toBe('D')
    expect(writableNote('F##')).toBe('G')
  })

  it('leaves an ordinary note exactly as it is', () => {
    for (const note of ['C', 'F#', 'Bb', 'A', 'Eb']) expect(writableNote(note)).toBe(note)
  })
})

describe('writableChord', () => {
  it('fixes the root and keeps everything hanging off it', () => {
    expect(writableChord('Cbmaj7')).toBe('Bmaj7')
    expect(writableChord('E#m7b5')).toBe('Fm7b5')
  })

  it('fixes the bass of a slash chord too', () => {
    expect(writableChord('Ab/Cb')).toBe('Ab/B')
  })

  it('leaves a chord that was already writable alone', () => {
    expect(writableChord('Am(add4)/F#')).toBe('Am(add4)/F#')
  })
})
