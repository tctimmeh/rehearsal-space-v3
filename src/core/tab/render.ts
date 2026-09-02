import type { Row } from './ink'
import {
  beatCount,
  isMiddleString,
  SIXTEENTH_MARKS,
  vibratoWidth,
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

/**
 * The opening dash, then contents and separator for every slot.
 *
 * A repeat's dots stand in the always-empty columns at either end of the bar,
 * on the two strings in the middle of the staff. Nothing is played there — it
 * is the space that keeps the notes off the bar lines — so there is room for
 * them without moving anything.
 */
export function renderBarRow(bar: Bar, string: number, widths: number[], strings: number): string {
  const middle = isMiddleString(string, strings)
  let row = bar.repeatStart === true && middle ? ':' : '-'
  slotsOf(bar).forEach((slot, index) => {
    row += contentOf(slot, string).padEnd(widths[index] ?? 1, '-') + (slot.after[string] ?? '-')
  })
  return bar.repeatTimes !== undefined && middle ? row.slice(0, -1) + ':' : row
}

/** How wide the line before a bar is: two where a repeat begins or ends on it. */
export const openingWidth = (bar: Bar | undefined, before: Bar | undefined): number =>
  bar?.repeatStart === true || before?.repeatTimes !== undefined ? 2 : 1

export const barWidth = (widths: number[]): number =>
  widths.reduce((total, width) => total + width + 1, 1)

/** Where each slot of a bar begins, counted from the bar's opening line. */
function slotColumns(widths: number[], opening = 1): number[] {
  const columns: number[] = []
  let at = opening + 1 /* past the line, however thick, and the opening dash */
  for (const width of widths) {
    columns.push(at)
    at += width + 1
  }
  return columns
}

interface Placed {
  bar: Bar
  widths: number[]
  /** Column of the bar's opening line within the line of text. */
  at: number
  /** How thick that line is: two where a repeat begins or ends on it. */
  opening: number
}

export interface System {
  bars: Placed[]
}

/** Breaks the bars into lines, whole bars at a time, as words wrap. */
export function layOut(doc: TabDoc, wrapAt = WRAP_COLUMNS): System[] {
  const systems: System[] = []
  let bars: Placed[] = []
  let at = 0

  doc.bars.forEach((bar, index) => {
    const widths = slotWidths(bar, doc.strings)
    const width = barWidth(widths)
    const opening = openingWidth(bar, doc.bars[index - 1])
    /* A bar that opens a section begins a line of its own whether or not the
       one before it had room: that is what dividing the music into sections
       means. The closing pipe of the line has to fit as well as the bar. */
    if (bars.length > 0 && (bar.opens !== undefined || at + width + opening + 1 > wrapAt)) {
      systems.push({ bars })
      bars = []
      at = 0
    }
    bars.push({ bar, widths, at, opening })
    /* The line between this bar and the next, which they share. */
    at += width + opening
  })

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
  for (const { bar, widths, at, opening } of system.bars) {
    const columns = slotColumns(widths, opening)
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
    /* How many times it goes round, right up against the line that closes the
       bar. Once is what a repeat means on its own, and says nothing. */
    const times = bar.repeatTimes ?? 0
    if (times > 1) {
      const mark = `x${times}`
      place(line, at + opening + barWidth(widths) - mark.length, mark)
    }
  }
  return finish(line)
}

/**
 * What the picking hand is doing, drawn between the beats and the strings.
 *
 * Both marks belong to a moment rather than to a string, so they share one
 * row: a palm mute is an `x` over its slot, and a vibrato a wave running on
 * from its note for as long as it is held.
 */
function handLine(system: System): string | null {
  const line: string[] = []
  let any = false
  for (const { bar, widths, at, opening } of system.bars) {
    const columns = slotColumns(widths, opening)
    slotsOf(bar).forEach((slot, index) => {
      const column = at + (columns[index] ?? 0)
      if (slot.palm === true) {
        place(line, column, 'x')
        any = true
      }
      const wave = vibratoWidth(slot.vibrato ?? 0)
      if (wave > 0) {
        place(line, column, '~'.repeat(wave))
        any = true
      }
    })
  }
  return any ? finish(line) : null
}

/** Chords sit over the beat they belong to, so widening a bar takes them with it. */
function chordLine(system: System): string | null {
  const line: string[] = []
  let any = false
  for (const { bar, widths, at, opening } of system.bars) {
    const columns = slotColumns(widths, opening)
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
    for (const { bar, widths, opening } of system.bars) {
      row += '|'.repeat(opening) + renderBarRow(bar, string, widths, strings)
    }
    /* The line that closes the last bar, thickened where a repeat ends on it. */
    const last = system.bars[system.bars.length - 1]?.bar
    return row + (last?.repeatTimes === undefined ? '|' : '||')
  })

/** One paragraph of the drawing: either a system, or the words above one. */
export interface Block {
  kind: 'words' | 'system'
  lines: string[]
  /** What each of those lines is, for a system. Said rather than guessed at:
      a system has a chord line only sometimes and a hand line only sometimes,
      and counting the lines cannot tell one absence from the other. */
  rows?: Row[]
  /** Line the first of those lines is drawn on. */
  from: number
  /** The bar this block belongs to: the one it opens, or the system's first. */
  bar: number
  system?: System
}

/**
 * The drawing, paragraph by paragraph.
 *
 * One walk, so that what is written down and where each line ended up cannot
 * come to disagree: the words above a section take up room, and everything
 * below them is that much further down the page. Both `render` and `laidOut`
 * are this, read two ways.
 */
export function blocksOf(doc: TabDoc, wrapAt = WRAP_COLUMNS): Block[] {
  const blocks: Block[] = []
  let line = 0
  let firstBar = 0

  for (const system of layOut(doc, wrapAt)) {
    const opening = system.bars[0]?.bar.opens
    /* A section opened but not yet named cannot be written down — there is
       nothing to write — so it is simply not drawn. It does not survive a save
       either: normalising drops it once the cursor has left. */
    if (opening !== undefined && opening.trim() !== '') {
      const words = opening.split('\n')
      blocks.push({ kind: 'words', lines: words, from: line, bar: firstBar })
      line += words.length + 1
    }

    const chords = chordLine(system)
    const hand = handLine(system)
    const lines = [
      ...(chords === null ? [] : [chords]),
      markerLine(system),
      ...(hand === null ? [] : [hand]),
      ...systemRows(system, doc.strings)
    ]
    const rows: Row[] = [
      ...(chords === null ? [] : ['chord' as Row]),
      'beats' as Row,
      ...(hand === null ? [] : ['hand' as Row]),
      ...Array.from({ length: doc.strings }, () => 'string' as Row)
    ]
    blocks.push({ kind: 'system', lines, rows, from: line, bar: firstBar, system })
    line += lines.length + 1
    firstBar += system.bars.length
  }

  return blocks
}

/** The whole document as the text it is stored and copied as. */
export function render(doc: TabDoc, wrapAt = WRAP_COLUMNS): string {
  return blocksOf(doc, wrapAt)
    .map((block) => block.lines.join('\n'))
    .join('\n\n') + '\n'
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
  return blocksOf(doc, wrapAt)
    .filter((block) => block.system !== undefined)
    .map((block) => ({
      system: block.system as System,
      firstBar: block.bar,
      /* The rows sit at the end of the block, under the chords and the beats. */
      top: block.from + block.lines.length - doc.strings
    }))
}

/**
 * Where a bar's closing line is drawn, for anything written against it.
 *
 * The column is the line itself, so whatever is put there is right-aligned to
 * it — which is where a repeat count goes, hard against the end of the bar it
 * counts.
 */
export function endOfBar(
  doc: TabDoc,
  bar: number,
  wrapAt = WRAP_COLUMNS
): { system: number; column: number } | null {
  for (const [index, laid] of laidOut(doc, wrapAt).entries()) {
    const placed = laid.system.bars[bar - laid.firstBar]
    if (placed === undefined) continue
    return { system: index, column: placed.at + placed.opening + barWidth(placed.widths) }
  }
  return null
}

/**
 * The section whose words are drawn directly above the cursor's system.
 *
 * Only directly above: a system that carries on from the one before it has
 * that system's own strings above it, not any words, and moving up out of it
 * should walk up the page rather than jump to the top of the section.
 */
export function wordsAboveCursor(
  doc: TabDoc,
  cursor: Cursor,
  wrapAt = WRAP_COLUMNS
): number | null {
  const blocks = blocksOf(doc, wrapAt)
  for (const [index, block] of blocks.entries()) {
    if (block.system === undefined) continue
    if (cursor.bar < block.bar || cursor.bar >= block.bar + block.system.bars.length) continue
    const before = blocks[index - 1]
    return before !== undefined && before.kind === 'words' ? before.bar : null
  }
  return null
}

/** Every slot of a system, with the column it is drawn at. */
function slotsAcross(
  laid: Laid
): { bar: number; beat: number; slot: number; column: number }[] {
  const found: { bar: number; beat: number; slot: number; column: number }[] = []
  laid.system.bars.forEach((placed, index) => {
    const columns = slotColumns(placed.widths, placed.opening)
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
    '|' + renderBarRow(bar, string, widths, strings) + '|'
  ).join('\n')
}

export const beatsIn = (bar: Bar): number => beatCount(bar)
export type { Beat }
