import { Chord, Note } from 'tonal'

import { writableNote } from '../music/spelling'

/**
 * Chord lines are found by looking at them rather than by being marked.
 *
 * Lyrics are written as plain text so they can be pasted in and out of
 * anything, which rules out a syntax for saying "this line is chords". The
 * structure gives it away instead: a line every word of which is a chord is a
 * chord line, and no line of English is.
 */

/** Written on charts but not played, so they neither disqualify nor transpose. */
const CHART_MARKS = new Set(['N.C.', 'NC', '|', '||', '%', '-', '/'])

export interface Piece {
  /** Column the piece starts at. */
  at: number
  text: string
  /** A parenthetical: a note to yourself rather than part of the song. */
  comment: boolean
}

/**
 * Splits a line into the things on it.
 *
 * A bracket that opens a word is part of that word — `Am(add4)` is one chord —
 * while a bracket standing on its own opens a remark, which runs to its
 * closing bracket and may contain anything at all, spaces and chord names
 * included. That distinction is the whole reason this is a scan rather than a
 * split on whitespace: `( E7/B = x-2-x-4-3-4 )` is one remark, not four words,
 * and nothing in it is a chord to be transposed.
 */
export function piecesOf(line: string): Piece[] {
  const pieces: Piece[] = []
  let index = 0

  while (index < line.length) {
    if (/\s/.test(line[index] as string)) {
      index += 1
      continue
    }

    if (line[index] === '(') {
      let depth = 0
      let end = index
      for (; end < line.length; end += 1) {
        if (line[end] === '(') depth += 1
        else if (line[end] === ')') {
          depth -= 1
          if (depth === 0) {
            end += 1
            break
          }
        }
      }
      pieces.push({ at: index, text: line.slice(index, end), comment: true })
      index = end
      continue
    }

    let end = index
    while (end < line.length && !/\s/.test(line[end] as string)) end += 1
    pieces.push({ at: index, text: line.slice(index, end), comment: false })
    index = end
  }

  return pieces
}

/**
 * Brackets inside a chord are decoration: `Am(add4)` and `Amadd4` are the same
 * chord, and only one of them is in any dictionary.
 */
const bare = (token: string): string => token.replaceAll('(', '').replaceAll(')', '')

export function isChordToken(token: string): boolean {
  return !Chord.get(bare(token)).empty
}

export function isChordLine(line: string): boolean {
  const words = piecesOf(line).filter((piece) => !piece.comment)
  if (words.length === 0) return false
  if (!words.some((word) => isChordToken(word.text))) return false
  return words.every((word) => isChordToken(word.text) || CHART_MARKS.has(word.text))
}

const SECTION_MARK = /^\s*\[[^\]]+\]\s*/

/**
 * `[Verse 2]`, `[Chorus]`, `[x2]` — a marker, written the way people write it.
 *
 * A remark may follow it, because that is where one belongs: `[ Chorus ] (x2)`
 * is still a chorus, and how many times it repeats is exactly the sort of thing
 * somebody writes beside the name. Only remarks may follow, though — a marker
 * with words after it is a line of the song that happens to open with a
 * bracket, and colouring the whole thing as a heading would be wrong.
 */
export function isSectionLine(line: string): boolean {
  const mark = SECTION_MARK.exec(line)
  if (mark === null) return false
  return piecesOf(line.slice(mark[0].length)).every((piece) => piece.comment)
}

/** A line marked as not finished: a placeholder, or words that need another go. */
export function isUnfinishedLine(line: string): boolean {
  return /^\s*-/.test(line)
}

export type LineKind = 'blank' | 'section' | 'chords' | 'unfinished' | 'lyric'

export function classifyLine(line: string): LineKind {
  if (line.trim() === '') return 'blank'
  if (isSectionLine(line)) return 'section'
  if (isUnfinishedLine(line)) return 'unfinished'
  if (isChordLine(line)) return 'chords'
  return 'lyric'
}

/**
 * Which interval each step is taken as, which is what decides the spelling.
 *
 * Not the interval a semitone count implies: that makes a step up from C a
 * minor second, which is D flat, while a step down from B is also a minor
 * second, which is A sharp — the opposite of how both are written by hand.
 * Taking the step as an augmented unison instead gives C sharp and B flat,
 * and leaves the thirds and fourths alone, so a minor third up from C is
 * still E flat rather than D sharp.
 */
const STEPS = ['1P', '1A', '2M', '3m', '3M', '4P', '4A', '5P', '6m', '6M', '7m', '7M', '8P']

/** Beyond an octave a chart is better rewritten than transposed. */
export const TRANSPOSE_LIMIT = 12

const stepOf = (semitones: number): string => {
  const size = Math.min(TRANSPOSE_LIMIT, Math.abs(Math.round(semitones)))
  return `${semitones < 0 ? '-' : ''}${STEPS[size] as string}`
}

const ROOT = /^([A-G](?:#{1,2}|b{1,2})?)/

/**
 * A chord moved by some number of semitones.
 *
 * Only the root and the bass note move; everything hanging off them is carried
 * across untouched. A chart is full of chords no dictionary has — `Am(add4)`,
 * `C6(#11)` — and what makes them chords is the root, which is the only part
 * transposing has anything to say about.
 *
 * The handful of names that are correct and never written — E sharp, C flat,
 * anything with a double accidental — are swapped for what goes on the page.
 */
export function transposeChord(chord: string, semitones: number): string {
  if (CHART_MARKS.has(chord) || !isChordToken(chord)) return chord
  const step = stepOf(semitones)

  return chord
    .split('/')
    .map((part) => {
      const root = ROOT.exec(part)?.[1]
      if (root === undefined) return part
      const moved = Note.transpose(root, step)
      return (moved === '' ? root : writableNote(moved)) + part.slice(root.length)
    })
    .join('/')
}

/**
 * Moves every chord on a line, keeping each one over the word it was over.
 *
 * The column is the whole point: a chord sits above the syllable it changes
 * on, and a transposition that reflows the line loses the one thing the line
 * was written to record. So each chord goes back at the column it came from,
 * and only a chord that grew enough to run into the next one pushes it along —
 * by as little as will fit. Remarks are carried across as they are.
 */
export function transposeChordLine(line: string, semitones: number): string {
  let out = ''
  for (const piece of piecesOf(line)) {
    const text = piece.comment ? piece.text : transposeChord(piece.text, semitones)
    const earliest = out.length === 0 ? 0 : out.length + 1
    out = out.padEnd(Math.max(piece.at, earliest)) + text
  }
  return out
}

/** Every chord in a song, leaving the words alone. */
export function transposeLyrics(text: string, semitones: number): string {
  if (semitones === 0) return text
  return text
    .split('\n')
    .map((line) => (isChordLine(line) ? transposeChordLine(line, semitones) : line))
    .join('\n')
}
