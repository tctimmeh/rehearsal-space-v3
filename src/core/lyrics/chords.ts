import { Chord, Note } from 'tonal'

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

export function isChordToken(token: string): boolean {
  return !Chord.get(token).empty
}

export function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter((token) => token !== '')
  if (tokens.length === 0) return false
  if (!tokens.some(isChordToken)) return false
  return tokens.every((token) => isChordToken(token) || CHART_MARKS.has(token))
}

/** `[Verse 2]`, `[Chorus]`, `[x2]` — a marker, written the way people write it. */
export function isSectionLine(line: string): boolean {
  return /^\s*\[[^\]]+\]\s*$/.test(line)
}

export type LineKind = 'blank' | 'section' | 'chords' | 'lyric'

export function classifyLine(line: string): LineKind {
  if (line.trim() === '') return 'blank'
  if (isSectionLine(line)) return 'section'
  if (isChordLine(line)) return 'chords'
  return 'lyric'
}

const ROOT = /^([A-G](?:#{1,2}|b{1,2})?)/

/** Correct, and never written: every chart spells these the other way. */
const UNWRITTEN = new Set(['E#', 'B#', 'Fb', 'Cb'])

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

/**
 * A chord moved by some number of semitones.
 *
 * The handful of names that are correct and never written — E sharp, C flat,
 * anything with a double accidental — are swapped for the note everybody
 * actually puts on the page.
 */
export function transposeChord(chord: string, semitones: number): string {
  if (CHART_MARKS.has(chord) || !isChordToken(chord)) return chord
  const moved = Chord.transpose(chord, stepOf(semitones))
  if (moved === '') return chord

  return moved
    .split('/')
    .map((part) => {
      const root = ROOT.exec(part)?.[1]
      if (root === undefined) return part
      return writable(root) + part.slice(root.length)
    })
    .join('/')
}

function writable(root: string): string {
  if (!/##|bb/.test(root) && !UNWRITTEN.has(root)) return root
  const simpler = Note.enharmonic(root)
  return simpler === '' ? root : simpler
}

interface Placed {
  at: number
  text: string
}

/**
 * Moves every chord on a line, keeping each one over the word it was over.
 *
 * The column is the whole point: a chord sits above the syllable it changes
 * on, and a transposition that reflows the line loses the one thing the line
 * was written to record. So each chord goes back at the column it came from,
 * and only a chord that grew enough to run into the next one pushes it along —
 * by as little as will fit.
 */
export function transposeChordLine(line: string, semitones: number): string {
  const placed: Placed[] = []
  for (const match of line.matchAll(/\S+/g)) {
    placed.push({ at: match.index, text: transposeChord(match[0], semitones) })
  }

  let out = ''
  for (const chord of placed) {
    const earliest = out.length === 0 ? 0 : out.length + 1
    out = out.padEnd(Math.max(chord.at, earliest)) + chord.text
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
