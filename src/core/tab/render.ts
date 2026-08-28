import {
  beatCount,
  SIXTEENTH_MARKS,
  type Bar,
  type Beat,
  type Cursor,
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

/**
 * How wide the file is written, in characters: as many bars to a line as fit,
 * and never fewer than one.
 *
 * Fixed, so that resizing the window never rewrites what is on disk — the
 * screen lays itself out to whatever room it has and this is left alone. Wide
 * enough to hold eight or nine plain bars, which is more than most editors
 * will wrap and about as much as anybody wants to read across.
 */
export const WRAP_COLUMNS = 160

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

/** A system, and where it ended up in the lines `render` produced. */
interface Laid {
  system: System
  /** Index of this system's first bar in the document. */
  firstBar: number
  /** Line the first string row is drawn on. */
  top: number
}

/**
 * Where every system landed in the text.
 *
 * The editor shows the drawing and edits the document, so both directions
 * between them are needed: where a cursor is drawn, and what was clicked on.
 */
export function laidOut(doc: TabDoc, wrapAt = WRAP_COLUMNS): Laid[] {
  const laid: Laid[] = []
  let line = 0
  let firstBar = 0

  for (const system of layOut(doc, wrapAt)) {
    /* The chord line if there is one, then the beat numbers. */
    const top = line + (chordLine(system) === null ? 0 : 1) + 1
    laid.push({ system, firstBar, top })
    firstBar += system.bars.length
    /* The rows themselves, and the blank line between systems. */
    line = top + doc.strings + 1
  }

  return laid
}

/** Every slot of a system, with the column it is drawn at. */
function slotsAcross(
  laid: Laid
): { bar: number; beat: number; slot: number; column: number }[] {
  const found: { bar: number; beat: number; slot: number; column: number }[] = []
  laid.system.bars.forEach((placed, index) => {
    const columns = slotColumns(placed.widths)
    let at = 0
    placed.bar.beats.forEach((beat, beatIndex) => {
      beat.slots.forEach((_, slotIndex) => {
        found.push({
          bar: laid.firstBar + index,
          beat: beatIndex,
          slot: slotIndex,
          column: placed.at + (columns[at] ?? 0)
        })
        at += 1
      })
    })
  })
  return found
}

/**
 * Where the cursor is in the drawing, so something can be drawn over it.
 *
 * Counted in lines and columns of what `render` returns, blank lines between
 * systems included, along with which system it fell in — which is what has to
 * be scrolled to, since showing the cursor alone would leave the beats it is
 * counted against off the top of the screen.
 */
export function placeOf(
  doc: TabDoc,
  cursor: Cursor,
  wrapAt = WRAP_COLUMNS
): { line: number; column: number; system: number } | null {
  const laid = laidOut(doc, wrapAt)

  for (const [index, held] of laid.entries()) {
    const rows = held.system.bars.length
    if (cursor.bar < held.firstBar || cursor.bar >= held.firstBar + rows) continue

    const found = slotsAcross(held).find(
      (place) => place.bar === cursor.bar && place.beat === cursor.beat && place.slot === cursor.slot
    )
    if (found === undefined) return null
    return { line: held.top + cursor.string, column: found.column, system: index }
  }

  return null
}

/**
 * What was clicked on, or what is straight above or below.
 *
 * Answers with the nearest slot rather than refusing when the column falls
 * between two: a click lands wherever it lands, and a cursor going up a line
 * should carry on up the screen rather than tracking which beat it was on in a
 * bar that may be a different shape.
 */
export function cursorAtPlace(
  doc: TabDoc,
  line: number,
  column: number,
  wrapAt = WRAP_COLUMNS
): Cursor | null {
  const laid = laidOut(doc, wrapAt)
  if (laid.length === 0) return null

  /* The system whose rows the line falls in, or the nearest one to it. */
  const held =
    laid.find((one) => line >= one.top && line < one.top + doc.strings) ??
    laid.reduce((best, one) =>
      Math.abs(one.top - line) < Math.abs(best.top - line) ? one : best
    )

  const string = Math.max(0, Math.min(doc.strings - 1, line - held.top))
  const slots = slotsAcross(held)
  if (slots.length === 0) return null

  const nearest = slots.reduce((best, one) =>
    Math.abs(one.column - column) < Math.abs(best.column - column) ? one : best
  )
  return { bar: nearest.bar, beat: nearest.beat, slot: nearest.slot, string }
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
