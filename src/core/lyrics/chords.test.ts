import { describe, expect, it } from 'vitest'

import { Chord } from 'tonal'

import {
  classifyLine,
  piecesOf,
  isChordLine,
  isSectionLine,
  transposeChord,
  transposeChordLine,
  transposeLyrics
} from './chords'

describe('telling chords from words', () => {
  it('knows a line of chords', () => {
    expect(isChordLine('C       Am      F       G')).toBe(true)
    expect(isChordLine('Em9  C#maj7  Bm7b5  Ab/C')).toBe(true)
  })

  it('knows a line of English', () => {
    expect(isChordLine('Counted every mile of the coast road')).toBe(false)
    expect(isChordLine('Am I the only one who stayed')).toBe(false)
  })

  it('is not fooled by a line that opens with a chord name', () => {
    /* "A" and "Am" are chords; "long" and "way" are not, so this is a lyric. */
    expect(isChordLine('A long way down')).toBe(false)
  })

  it('allows the marks people write on charts between the chords', () => {
    expect(isChordLine('| C  Am | F  G |')).toBe(true)
    expect(isChordLine('C  N.C.  G')).toBe(true)
  })

  it('does not call a line of bar lines a chord line', () => {
    expect(isChordLine('| | |')).toBe(false)
  })

  it('has nothing to say about an empty line', () => {
    expect(isChordLine('')).toBe(false)
    expect(isChordLine('    ')).toBe(false)
  })
})

describe('section markers', () => {
  it('recognises the way people write them', () => {
    expect(isSectionLine('[Verse 2]')).toBe(true)
    expect(isSectionLine('  [Chorus]  ')).toBe(true)
    expect(isSectionLine('[x2]')).toBe(true)
  })

  it('leaves a line that merely contains a bracket alone', () => {
    expect(isSectionLine('I said [nothing] at all')).toBe(false)
    expect(isSectionLine('[]')).toBe(false)
  })
})

describe('classifyLine', () => {
  it('sorts a song into its kinds of line', () => {
    expect(classifyLine('[Verse]')).toBe('section')
    expect(classifyLine('C  G  Am')).toBe('chords')
    expect(classifyLine('Counted every mile')).toBe('lyric')
    expect(classifyLine('   ')).toBe('blank')
  })
})

describe('transposeChord', () => {
  it('moves a chord and keeps what kind of chord it is', () => {
    expect(transposeChord('C', 2)).toBe('D')
    expect(transposeChord('Am', 2)).toBe('Bm')
    expect(transposeChord('F#m7', 1)).toBe('Gm7')
    expect(transposeChord('Dsus4', 5)).toBe('Gsus4')
    expect(transposeChord('Cadd9', -2)).toBe('Bbadd9')
  })

  /**
   * Strictly, F sharp down a semitone is E sharp. Nobody writes that.
   */
  it('takes a step up as a sharp and a step down as a flat', () => {
    expect(transposeChord('C', 1)).toBe('C#')
    expect(transposeChord('B', -1)).toBe('Bb')
    expect(transposeChord('A', -1)).toBe('Ab')
  })

  it('spells a third up as a third, not as a sharpened second', () => {
    /* Everybody writes E flat here; nobody writes D sharp. */
    expect(transposeChord('C', 3)).toBe('Eb')
    expect(transposeChord('A', 3)).toBe('C')
  })

  it('never writes a name that is correct but nobody uses', () => {
    /* F sharp down a semitone is E sharp, which no chart has ever said. */
    expect(transposeChord('F#', -1)).toBe('F')
    expect(transposeChord('E', 1)).toBe('F')
    expect(transposeChord('B', 1)).toBe('C')
  })

  it('moves both halves of a slash chord', () => {
    expect(transposeChord('C/E', 3)).toBe('Eb/G')
  })

  it('never writes a double accidental', () => {
    /* D flat up a semitone is D, not E double flat. */
    expect(transposeChord('Db', 1)).toBe('D')
    for (const semitones of [-11, -6, -1, 1, 6, 11]) {
      for (const chord of ['Db', 'B#', 'Gb', 'A#', 'Fb', 'E#']) {
        expect(transposeChord(chord, semitones)).not.toMatch(/##|bb/)
      }
    }
  })

  it('leaves chart marks and anything it does not understand alone', () => {
    expect(transposeChord('N.C.', 4)).toBe('N.C.')
    expect(transposeChord('|', 4)).toBe('|')
    expect(transposeChord('mumble', 4)).toBe('mumble')
  })

  it('goes back where it came from', () => {
    for (const chord of ['C', 'Am', 'F#m7', 'Bb', 'C/E', 'Bm7b5', 'Dsus4']) {
      const there = transposeChord(chord, 5)
      expect(transposeChord(there, -5)).toBe(chord)
    }
  })
})

/**
 * The column is the whole point of a chord line: it sits above the syllable it
 * changes on, and a transposition that reflows the line loses the one thing
 * the line was written to record.
 */
describe('transposeChordLine', () => {
  it('keeps every chord over the word it was over', () => {
    const before = 'C       Am      F       G'
    const after = transposeChordLine(before, 2)
    expect(after).toBe('D       Bm      G       A')
  })

  it('keeps the column when a chord gets shorter', () => {
    expect(transposeChordLine('F#      B', -1)).toBe('F       Bb')
  })

  it('holds the column of the chords around one that grew', () => {
    /* C becomes C#, one wider, and the chords after it have not moved. */
    const after = transposeChordLine('C     G     Am', 1)
    expect(after).toBe('C#    G#    A#m')
  })

  it('pushes the next chord along only when there is no room left', () => {
    /* C becomes two characters wide, leaving no gap before the next chord. */
    const after = transposeChordLine('C  G', 1)
    expect(after).toBe('C# G#')
  })

  it('never runs two chords together', () => {
    const after = transposeChordLine('C G Am F', 1)
    for (const token of after.split(/\s+/)) expect(token).not.toMatch(/[A-G].*[A-G]/)
  })

  it('leaves the indent of a line that starts part way in', () => {
    expect(transposeChordLine('    C   G', 2)).toBe('    D   A')
  })
})

describe('transposing a whole song', () => {
  const song = [
    '[Verse 1]',
    'C       Am',
    'Counted every mile of the coast road',
    '',
    'F       G',
    "Said I'd stop when the radio gave out"
  ].join('\n')

  it('moves the chords and leaves the words exactly as they were', () => {
    const up = transposeLyrics(song, 2)
    expect(up.split('\n')).toEqual([
      '[Verse 1]',
      'D       Bm',
      'Counted every mile of the coast road',
      '',
      'G       A',
      "Said I'd stop when the radio gave out"
    ])
  })

  it('changes nothing at all when asked for nothing', () => {
    expect(transposeLyrics(song, 0)).toBe(song)
  })

  it('comes back to where it started', () => {
    expect(transposeLyrics(transposeLyrics(song, 7), -7)).toBe(song)
  })
})

describe('how far it will go', () => {
  it('moves a whole octave', () => {
    expect(transposeChord('C', 12)).toBe('C')
    expect(transposeChord('Am', -12)).toBe('Am')
  })

  it('goes no further than an octave, whatever it is asked for', () => {
    expect(transposeChord('C', 25)).toBe(transposeChord('C', 12))
  })
})

/**
 * Every line here is from a real song in the library, which is where each of
 * these turned out to be missing.
 */
describe('chords as people actually write them', () => {
  it('reads a chord with a bracketed extension', () => {
    expect(isChordLine('Am(add4)/F#           G       G7')).toBe(true)
    expect(isChordLine('C6(#11)')).toBe(true)
  })

  it('moves one without losing what is hanging off it', () => {
    expect(transposeChord('Am(add4)', 2)).toBe('Bm(add4)')
    expect(transposeChord('Am(add4)/F#', 2)).toBe('Bm(add4)/G#')
    expect(transposeChord('C6(#11)', 1)).toBe('C#6(#11)')
  })

  it('reads a chord line with a repeat mark on the end', () => {
    expect(isChordLine('C  Fmaj7/C  C  (x2)')).toBe(true)
  })

  it('reads a chord line with a remark on the end', () => {
    expect(isChordLine('Dm7                   F           G7  (single strum and hold)')).toBe(
      true
    )
  })

  it('does not mistake a remark for a chord line', () => {
    expect(isChordLine('(Repeat intro x2, End on beat 3)')).toBe(false)
    expect(classifyLine('(Repeat intro x2, End on beat 3)')).toBe('lyric')
  })
})

describe('remarks in brackets', () => {
  const line = '  C      E7/B      Am(add4)     ( E7/B = x-2-x-4-3-4, Am(add4) = x-0-x-5-3-5 )'

  it('is one piece however many words are in it', () => {
    const remarks = piecesOf(line).filter((piece) => piece.comment)
    expect(remarks).toHaveLength(1)
    expect(remarks[0]?.text).toBe('( E7/B = x-2-x-4-3-4, Am(add4) = x-0-x-5-3-5 )')
  })

  it('leaves the chord names inside a remark exactly as written', () => {
    const moved = transposeChordLine(line, 2)

    expect(moved).toContain('( E7/B = x-2-x-4-3-4, Am(add4) = x-0-x-5-3-5 )')
    expect(piecesOf(moved).map((piece) => piece.text)).toEqual([
      'D',
      'F#7/C#',
      'Bm(add4)',
      '( E7/B = x-2-x-4-3-4, Am(add4) = x-0-x-5-3-5 )'
    ])
  })

  it('holds every column on the line, remark included', () => {
    const before = piecesOf(line).map((piece) => piece.at)
    const after = piecesOf(transposeChordLine(line, 2)).map((piece) => piece.at)
    expect(after).toEqual(before)
  })

  it('runs to the end of the line when the bracket is never closed', () => {
    const pieces = piecesOf('C   (unfinished thought')
    expect(pieces[1]?.text).toBe('(unfinished thought')
  })

  it('is found on a line of words as readily as on a line of chords', () => {
    const pieces = piecesOf('Storm winds blowing  ("only know to run" is awkward)')
    expect(pieces.filter((piece) => piece.comment)[0]?.text).toBe(
      '("only know to run" is awkward)'
    )
  })
})

describe('lines marked as not finished', () => {
  it('takes a dash at the start as the mark, spaced or not', () => {
    expect(classifyLine('- Storm winds blowing and we only know to run')).toBe('unfinished')
    expect(classifyLine('-Something something something something')).toBe('unfinished')
    expect(classifyLine('   - indented and unfinished')).toBe('unfinished')
  })

  it('leaves a dash inside a line alone', () => {
    expect(classifyLine('A long — long time ago')).toBe('lyric')
    expect(classifyLine('well-worn and waiting')).toBe('lyric')
  })
})
