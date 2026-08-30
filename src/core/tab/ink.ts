/**
 * What each character of the drawing is, so the editor can weight them.
 *
 * The text is the document, and it is deliberately plain — but read on screen
 * it is nearly all filler. A bar of six strings is a couple of hundred dashes
 * holding up half a dozen numbers, and drawn in one colour the numbers are
 * lost in the grid. So each character is told apart by what it is: notes and
 * beat numbers carry the music, bar lines carry its shape, and the sixteenth
 * marks are a detail you only look for when you are looking for it.
 *
 * The same character means different things on different rows — a digit is a
 * fret on a string and a beat above it — so the row has to be known first.
 */

export type Row = 'chord' | 'beats' | 'string'

export type Ink = 'note' | 'beat' | 'bar' | 'sub' | 'chord' | 'string' | 'plain'

/**
 * The rows of one drawn system, in order.
 *
 * A chord line is only written when a bar in the system has a chord on it,
 * which is what the extra row means.
 */
export function rowsOf(lines: number, strings: number): Row[] {
  const rows: Row[] = lines > strings + 1 ? ['chord', 'beats'] : ['beats']
  while (rows.length < lines) rows.push('string')
  return rows
}

const isDigit = (character: string): boolean => character >= '0' && character <= '9'

/** The sixteenths either side of the eighth, which the `&` is not. */
const isSixteenth = (character: string): boolean => character === 'e' || character === 'a'

const isTechnique = (character: string): boolean =>
  character === '/' || character === '\\' || character === '^'

const inkFor = (character: string, row: Row): Ink => {
  if (row === 'chord') return character === ' ' ? 'plain' : 'chord'
  if (row === 'beats') {
    if (isDigit(character)) return 'beat'
    if (isSixteenth(character)) return 'sub'
    return 'plain'
  }
  if (character === '|') return 'bar'
  /* A slide belongs to the note it slides into, and is read with it. */
  if (isDigit(character) || character === 'x' || isTechnique(character)) return 'note'
  /* The dashes are the string itself — told apart from the blank a cursor
     standing past the end of a line sits on, which is nothing at all. */
  if (character === '-') return 'string'
  return 'plain'
}

/** One ink per character of the line. */
export const inkOf = (line: string, row: Row): Ink[] =>
  [...line].map((character) => inkFor(character, row))
