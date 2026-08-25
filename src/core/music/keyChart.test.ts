import { describe, expect, it } from 'vitest'

import { describeSignature, keyChart, tonicsFor } from './keyChart'

const triadsOf = (tonic: string, mode: 'major' | 'minor') =>
  keyChart(tonic, mode).diatonic.map((entry) => entry.triad)

const degreesOf = (tonic: string, mode: 'major' | 'minor') =>
  keyChart(tonic, mode).diatonic.map((entry) => entry.degree)

describe('the chords of a key', () => {
  it('knows C major', () => {
    expect(triadsOf('C', 'major')).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'])
  })

  it('knows A minor', () => {
    expect(triadsOf('A', 'minor')).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G'])
  })

  it('spells a flat key with flats', () => {
    expect(triadsOf('Eb', 'major')).toEqual(['Eb', 'Fm', 'Gm', 'Ab', 'Bb', 'Cm', 'Ddim'])
  })

  it('offers the seventh of every degree as well as the plain chord', () => {
    const chart = keyChart('C', 'major')
    expect(chart.diatonic.map((entry) => entry.seventh)).toEqual([
      'Cmaj7',
      'Dm7',
      'Em7',
      'Fmaj7',
      'G7',
      'Am7',
      'Bm7b5'
    ])
  })
})

/**
 * Case is the whole point of a numeral: it says major or minor without a word.
 */
describe('the numerals', () => {
  it('writes major degrees large and minor degrees small', () => {
    expect(degreesOf('C', 'major')).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'])
  })

  it('keeps the flats of a minor key', () => {
    expect(degreesOf('A', 'minor')).toEqual(['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII'])
  })
})

describe('what a key is related to', () => {
  it('names the relative minor of a major key', () => {
    expect(keyChart('C', 'major').relative).toEqual({ tonic: 'A', mode: 'minor' })
  })

  it('names the relative major of a minor key', () => {
    expect(keyChart('A', 'minor').relative).toEqual({ tonic: 'C', mode: 'major' })
  })

  it('names the parallel key, which shares the tonic rather than the notes', () => {
    expect(keyChart('C', 'major').parallel).toEqual({ tonic: 'C', mode: 'minor' })
  })

  it('says how many sharps or flats it carries', () => {
    expect(keyChart('C', 'major').signature).toBe('no sharps or flats')
    expect(keyChart('D', 'major').signature).toBe('2 sharps')
    expect(keyChart('F', 'major').signature).toBe('1 flat')
    expect(keyChart('Eb', 'major').signature).toBe('3 flats')
  })
})

describe('borrowed chords', () => {
  it('offers the parallel key chords that are not already here', () => {
    const borrowed = keyChart('C', 'major').borrowed.map((entry) => entry.triad)
    expect(borrowed).toContain('Fm')
    expect(borrowed).toContain('Ab')
    expect(borrowed).toContain('Bb')
    expect(borrowed).toContain('Cm')
  })

  it('does not offer a chord the key already has', () => {
    const chart = keyChart('C', 'major')
    const held = chart.diatonic.map((entry) => entry.triad)
    for (const entry of chart.borrowed) expect(held).not.toContain(entry.triad)
  })

  it('borrows the other way for a minor key', () => {
    const borrowed = keyChart('A', 'minor').borrowed.map((entry) => entry.triad)
    expect(borrowed).toContain('A')
    expect(borrowed).toContain('D')
    expect(borrowed).toContain('E')
  })
})

/**
 * Natural minor has no dominant seventh and no leading note, which is why
 * almost no song in a minor key stays in it.
 */
describe('a minor key', () => {
  it('offers the chords harmonic minor adds', () => {
    const added = keyChart('A', 'minor').fromHarmonicMinor.map((entry) => entry.triad)
    expect(added).toContain('E')
    expect(added.some((triad) => triad.startsWith('G#'))).toBe(true)
  })

  it('offers nothing of the kind for a major key', () => {
    expect(keyChart('C', 'major').fromHarmonicMinor).toEqual([])
  })
})

describe('secondary dominants', () => {
  it('gives the chord that leads to each degree', () => {
    const leading = keyChart('C', 'major').secondaryDominants
    expect(leading.find((entry) => entry.leadsTo === 'G')?.chord).toBe('D7')
    expect(leading.find((entry) => entry.leadsTo === 'Am')?.chord).toBe('E7')
  })

  it('leaves out the degrees that have none', () => {
    for (const entry of keyChart('C', 'major').secondaryDominants) {
      expect(entry.chord).not.toBe('')
    }
  })
})

/**
 * Every pitch can be spelled two ways and one of them is always ridiculous:
 * D sharp major needs nine sharps, two of them double.
 */
describe('which tonics are offered', () => {
  it('offers twelve, one per pitch', () => {
    expect(tonicsFor('major')).toHaveLength(12)
    expect(tonicsFor('minor')).toHaveLength(12)
  })

  it('spells a major key the way it is written', () => {
    expect(tonicsFor('major')).toContain('Eb')
    expect(tonicsFor('major')).not.toContain('D#')
    expect(tonicsFor('major')).toContain('Db')
    expect(tonicsFor('major')).not.toContain('C#')
  })

  it('spells a minor key the way it is written', () => {
    /* C sharp minor has four sharps; D flat minor has eight flats. */
    expect(tonicsFor('minor')).toContain('C#')
    expect(tonicsFor('minor')).not.toContain('Db')
  })

  it('never offers a key nobody would write in', () => {
    for (const mode of ['major', 'minor'] as const) {
      for (const tonic of tonicsFor(mode)) {
        expect(keyChart(tonic, mode).signature).not.toMatch(/[7-9]|1[0-9]/)
      }
    }
  })
})

describe('describeSignature', () => {
  it('counts in the singular where it should', () => {
    expect(describeSignature('#')).toBe('1 sharp')
    expect(describeSignature('bb')).toBe('2 flats')
    expect(describeSignature('')).toBe('no sharps or flats')
  })
})

describe('the pitch that needs six accidentals either way', () => {
  it('is written F sharp in major and E flat in minor, as it always has been', () => {
    expect(tonicsFor('major')).toContain('F#')
    expect(tonicsFor('major')).not.toContain('Gb')
    expect(tonicsFor('minor')).toContain('Eb')
    expect(tonicsFor('minor')).not.toContain('D#')
  })
})

/**
 * The editor refuses to write C flat when transposing, so a chart that wrote
 * it would disagree with the song sitting beside it.
 */
describe('spelling that agrees with the editor', () => {
  it('offers B rather than C flat', () => {
    const borrowed = keyChart('Eb', 'major').borrowed.map((entry) => entry.triad)
    expect(borrowed).toContain('B')
    expect(borrowed).not.toContain('Cb')
  })

  it('offers F rather than E sharp', () => {
    const chords = keyChart('F#', 'major').diatonic.map((entry) => entry.triad)
    expect(chords).toContain('Fdim')
    expect(chords).not.toContain('E#dim')
  })

  it('never writes one anywhere on any chart it can produce', () => {
    const unwritable = /(^|[^A-G])(Cb|E#|B#|Fb)([^a-z]|$)|##|bb/
    for (const mode of ['major', 'minor'] as const) {
      for (const tonic of tonicsFor(mode)) {
        const chart = keyChart(tonic, mode)
        const everything = [
          ...chart.diatonic,
          ...chart.borrowed,
          ...chart.fromHarmonicMinor
        ].flatMap((entry) => [entry.triad, entry.seventh])
        const leading = chart.secondaryDominants.flatMap((entry) => [entry.chord, entry.leadsTo])
        for (const chord of [...everything, ...leading]) {
          expect(chord, `${tonic} ${mode}: ${chord}`).not.toMatch(unwritable)
        }
      }
    }
  })
})
