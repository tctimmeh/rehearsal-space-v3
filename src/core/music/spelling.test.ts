import { describe, expect, it } from 'vitest'

import { prettyChord, prettyDegree } from './spelling'

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
