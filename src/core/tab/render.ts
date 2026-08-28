import {
  beatCount,
  SIXTEENTH_MARKS,
  type Bar,
  type Beat,
  type Slot,
  type TabDoc
} from './document'

/**
 * Drawing tablature.
 *
 * One rule decides every column, and it is worth stating exactly because the
 * sketch this came from used two of them and its own examples disagree:
 *
 *   a bar opens with one dash, and then every slot is its contents followed by
 *   a single separator character.
 *
 * Contents are one or two digits, or `x`, or a dash where the string is not
 * played; a slot is as wide as the widest of them across the strings, so a
 * twelfth fret widens its column on every string at once and the beats after
 * it shift right together. The separator is normally a dash and is where a
 * slide or a hammer-on is drawn. The always-empty last column of a bar is not
 * a special case: it is the last slot's separator.
 *
 * Everything else here — where the beat numbers go, where the chords go, where
 * the line breaks — follows from that.
 */

/** As many bars to a line as fit in this, and never fewer than one. */
export const WRAP_COLUMNS = 76

const contentOf = (slot: Slot, string: number): string => slot.frets[string] ?? '-'

/** How wide each slot of a bar is drawn: the widest thing any string plays. */
export const slotWidths = (bar: Bar, strings: number): number[] =>
  bar.beats.flatMap((beat) =>
    beat.slots.map((slot) => {
      let widest = 1
      for (let string = 0; string < strings; string += 1) {
        widest = Math.max(widest, contentOf(slot, string).length)
      }
      return widest
    })
  )

const slotsOf = (bar: Bar): Slot[] => bar.beats.flatMap((beat) => beat.slots)

/** The opening dash, then contents and separator for every slot. */
export function renderBarRow(bar: Bar, string: number, widths: number[]): string {
  let row = '-'
  slotsOf(bar).forEach((slot, index) => {
    row += contentOf(slot, string).padEnd(widths[index] ?? 1, '-') + (slot.after[string] ?? '-')
  })
  return row
}

export const barWidth = (widths: number[]): number =>
  widths.reduce((total, width) => total + width + 1, 1)

/** Where each slot of a bar begins, counted from the bar's opening pipe. */
function slotColumns(widths: number[]): number[] {
  const columns: number[] = []
  let at = 2 /* past the pipe and the opening dash */
  for (const width of widths) {
    columns.push(at)
    at += width + 1
  }
  return columns
}

interface Placed {
  bar: Bar
  widths: number[]
  /** Column of the bar's opening pipe within the line. */
  at: number
}

export interface System {
  bars: Placed[]
}

/** Breaks the bars into lines, whole bars at a time, as words wrap. */
export function layOut(doc: TabDoc, wrapAt = WRAP_COLUMNS): System[] {
  const systems: System[] = []
  let bars: Placed[] = []
  let at = 0

  for (const bar of doc.bars) {
    const widths = slotWidths(bar, doc.strings)
    const width = barWidth(widths)
    /* The closing pipe of the line has to fit as well as the bar. */
    if (bars.length > 0 && at + width + 1 > wrapAt) {
      systems.push({ bars })
      bars = []
      at = 0
    }
    bars.push({ bar, widths, at })
    /* One column for the pipe between this bar and the next, which they share. */
    at += width + 1
  }

  if (bars.length > 0) systems.push({ bars })
  return systems
}

/**
 * Writes text at exactly the column asked for.
 *
 * The beat markers have to land on their slot's column and nowhere else: it is
 * the only thing saying which of the four sixteenths a slot is standing on,
 * and a mark nudged aside by the `0` of a `10` beside it makes the drawing
 * unreadable to anything trying to read it back.
 */
function place(line: string[], at: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) line[at + i] = text[i] as string
}

/** As above, but shuffled right rather than allowed to run into its neighbour. */
function placeClear(line: string[], at: number, text: string): void {
  let start = at
  while (start > 0 && line[start - 1] !== undefined && line[start - 1] !== ' ') start += 1
  place(line, start, text)
}

const finish = (line: string[]): string => {
  let text = ''
  for (let i = 0; i < line.length; i += 1) text += line[i] ?? ' '
  return text.replace(/\s+$/, '')
}

/**
 * The beat numbers, and the subdivisions of any beat that has them.
 *
 * A plain beat — the beat and its eighth — gets no `&`. The mark is only put
 * in where a sixteenth made it necessary to say which of the four positions a
 * slot is standing on; with two slots there is nothing to disambiguate, and
 * the sketch's examples agree. What the line is always for is saying where the
 * beats fall, which is also all the parser needs from it.
 */
function markerLine(system: System): string {
  const line: string[] = []
  for (const { bar, widths, at } of system.bars) {
    const columns = slotColumns(widths)
    let slot = 0
    bar.beats.forEach((beat, index) => {
      place(line, at + (columns[slot] ?? 0), String(index + 1))
      if (beat.slots.length > 2) {
        beat.slots.forEach((held, offset) => {
          const mark = SIXTEENTH_MARKS[held.at]
          if (mark !== '') place(line, at + (columns[slot + offset] ?? 0), mark)
        })
      }
      slot += beat.slots.length
    })
  }
  return finish(line)
}

/** Chords sit over the beat they belong to, so widening a bar takes them with it. */
function chordLine(system: System): string | null {
  const line: string[] = []
  let any = false
  for (const { bar, widths, at } of system.bars) {
    const columns = slotColumns(widths)
    let slot = 0
    for (const beat of bar.beats) {
      if (beat.chord !== null && beat.chord !== '') {
        placeClear(line, at + (columns[slot] ?? 0), beat.chord)
        any = true
      }
      slot += beat.slots.length
    }
  }
  return any ? finish(line) : null
}

const systemRows = (system: System, strings: number): string[] =>
  Array.from({ length: strings }, (_, string) => {
    let row = ''
    for (const { bar, widths } of system.bars) row += '|' + renderBarRow(bar, string, widths)
    return row + '|'
  })

/** The whole document as the text it is stored and copied as. */
export function render(doc: TabDoc, wrapAt = WRAP_COLUMNS): string {
  const blocks = layOut(doc, wrapAt).map((system) => {
    const chords = chordLine(system)
    return [
      ...(chords === null ? [] : [chords]),
      markerLine(system),
      ...systemRows(system, doc.strings)
    ].join('\n')
  })
  return blocks.join('\n\n') + '\n'
}

/** One bar on its own, which is what the tests and the clipboard mostly want. */
export const renderBar = (bar: Bar, strings: number): string => {
  const widths = slotWidths(bar, strings)
  return Array.from({ length: strings }, (_, string) =>
    '|' + renderBarRow(bar, string, widths) + '|'
  ).join('\n')
}

export const beatsIn = (bar: Bar): number => beatCount(bar)
export type { Beat }
