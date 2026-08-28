import {
  emptySlot,
  isFret,
  ON_BEAT,
  OFF_BEAT,
  type Beat,
  type Bar,
  type Fret,
  type Sixteenth,
  type Slot,
  type TabDoc,
  type Technique
} from './document'

/**
 * Reading tablature back out of the text it was drawn as.
 *
 * This is only possible because the drawing follows one rule — contents, then
 * exactly one separator, for every slot — which makes the columns walkable
 * without guessing. A run of dashes is not ambiguous: they alternate between
 * empty slots and the separators after them.
 *
 * Where the beats fall is the one thing the columns cannot say, and it is what
 * the line of beat numbers above them is for. Without that line the rhythm is
 * genuinely unknown, and eighths are assumed, which is what most tablature
 * found in the wild turns out to be.
 */

interface ReadSlot {
  /** What each string reads at this moment, or null where it is not played. */
  texts: (string | null)[]
  afters: Technique[]
  /** Column within the line, so the beat markers can be lined up with it. */
  at: number
}

const isTechnique = (character: string): character is Technique =>
  character === '-' || character === '/' || character === '\\' || character === '^'

const noteAt = (content: string, at: number): string | null =>
  /^(?:\d{1,2}|x)/.exec(content.slice(at))?.[0] ?? null

/**
 * Walks a bar across every string at once.
 *
 * It has to be every string together, because a fret is padded out to the
 * width of its column and the padding is drawn with the same dash the
 * separator is. Read one string on its own and a `3` sitting in a column two
 * wide looks like a note followed by its separator, and everything after it
 * lands a column early. Read them side by side and the width is simply the
 * widest thing any string plays there, which is how it was drawn.
 */
function readBar(contents: string[], from: number): ReadSlot[] | null {
  if (contents.length === 0 || !contents.every((content) => content.startsWith('-'))) return null

  const width = Math.max(...contents.map((content) => content.length))
  const slots: ReadSlot[] = []
  let at = 1

  while (at < width) {
    const texts = contents.map((content) => noteAt(content, at))
    const held = Math.max(1, ...texts.map((text) => text?.length ?? 1))

    /* A bar drawn a column short — by hand, or by another program — loses its
       last separator. Reading it as a plain one keeps the bar rather than
       throwing the whole thing away over its last character. */
    const afters = contents.map((content) => {
      const join = content[at + held] ?? '-'
      return isTechnique(join) ? join : '-'
    })

    slots.push({ texts, afters, at: from + at })
    at += held + 1
  }

  return slots
}

/** A line of the tablature itself, rather than of the writing around it. */
const isStringRow = (line: string): boolean => line.trimStart().startsWith('|')

const isMarkerRow = (line: string): boolean =>
  !line.includes('|') && /\d/.test(line) && /^[\s\d&ea]*$/.test(line)

interface Block {
  chords: string | null
  markers: string | null
  rows: string[]
}

/** Splits the text into what is drawn together: chords, beats, and the strings. */
function blocksOf(lines: string[]): Block[] {
  const blocks: Block[] = []
  let at = 0

  while (at < lines.length) {
    if (!isStringRow(lines[at] as string)) {
      at += 1
      continue
    }
    const rows: string[] = []
    while (at < lines.length && isStringRow(lines[at] as string)) {
      rows.push((lines[at] as string).trimStart())
      at += 1
    }

    const before = blocks.length === 0 ? 0 : 0
    void before
    const start = at - rows.length
    const markers = start > 0 && isMarkerRow(lines[start - 1] as string) ? lines[start - 1] : null
    const chordsAt = markers === null ? start - 1 : start - 2
    const candidate = chordsAt >= 0 ? (lines[chordsAt] as string) : ''
    const chords =
      chordsAt >= 0 && candidate.trim() !== '' && !candidate.includes('|') && !isMarkerRow(candidate)
        ? candidate
        : null

    blocks.push({ chords: chords ?? null, markers: markers ?? null, rows })
  }

  return blocks
}

/** Where each bar of a row begins, and what is between the pipes. */
function barsOf(row: string): { content: string; at: number }[] {
  const bars: { content: string; at: number }[] = []
  let at = row.indexOf('|')
  while (at !== -1) {
    const next = row.indexOf('|', at + 1)
    if (next === -1) break
    bars.push({ content: row.slice(at + 1, next), at: at + 1 })
    at = next
  }
  return bars
}

/** The columns the beat numbers sit on, which is where the beats begin. */
const beatColumns = (markers: string | null): number[] =>
  markers === null ? [] : [...markers.matchAll(/\d+/g)].map((match) => match.index)

/**
 * Which of the four sixteenth positions a slot is standing on.
 *
 * Written above it when the beat holds more than two slots, and otherwise not
 * written at all — with two there is only one thing they can be, the beat and
 * its eighth.
 */
function sixteenthAt(markers: string | null, column: number): Sixteenth {
  const mark = markers?.[column]
  if (mark === 'e') return 1
  if (mark === 'a') return 3
  return OFF_BEAT
}

/**
 * Groups a bar's slots into beats.
 *
 * A slot begins a beat when a beat number is written above it. Anything the
 * markers do not account for — a file written by hand, or by something else —
 * falls back to two slots a beat, which is what unmarked tablature means by
 * convention.
 */
function intoBeats(slots: Slot[], columns: number[], starts: number[]): Beat[] {
  const marked = starts.filter((column) => columns.includes(column))
  const boundaries =
    marked.length > 0 ? marked.map((column) => columns.indexOf(column)) : evenBoundaries(slots.length)

  const beats: Beat[] = []
  boundaries.forEach((start, index) => {
    const end = boundaries[index + 1] ?? slots.length
    beats.push({ slots: slots.slice(start, end), chord: null })
  })
  return beats.filter((beat) => beat.slots.length > 0)
}

/** Says where in its beat each slot stands, now that the beats are known. */
function markPositions(beats: Beat[], columns: number[], markers: string | null): void {
  let index = 0
  for (const beat of beats) {
    beat.slots.forEach((slot, offset) => {
      const column = columns[index + offset] ?? 0
      /* With two slots there is nothing to disambiguate: they are the beat and
         its eighth, and nothing is written above them to say so. */
      slot.at = offset === 0 ? ON_BEAT : sixteenthAt(markers, column)
    })
    index += beat.slots.length
  }
}

const evenBoundaries = (count: number): number[] =>
  Array.from({ length: Math.max(1, Math.ceil(count / 2)) }, (_, index) => index * 2)

/** Reads the chords written above a system back onto the beats they sit over. */
function attachChords(bars: Bar[], columns: number[][], chords: string | null): void {
  if (chords === null) return
  for (const match of chords.matchAll(/\S+/g)) {
    const at = match.index
    let best: { bar: number; beat: number; distance: number } | null = null
    bars.forEach((bar, barIndex) => {
      let slot = 0
      bar.beats.forEach((beat, beatIndex) => {
        const column = columns[barIndex]?.[slot]
        if (column !== undefined) {
          const distance = Math.abs(column - at)
          if (best === null || distance < best.distance) {
            best = { bar: barIndex, beat: beatIndex, distance }
          }
        }
        slot += beat.slots.length
      })
    })
    if (best !== null) {
      const found = best as { bar: number; beat: number; distance: number }
      const beat = bars[found.bar]?.beats[found.beat]
      if (beat !== undefined) beat.chord = match[0]
    }
  }
}

/**
 * Reads a whole document.
 *
 * Tolerant on purpose: a row that cannot be walked is skipped rather than
 * refused, because the alternative is a file that will not open at all. The
 * number of strings comes from the first block, since that is the only place
 * it is written down.
 */
export function parse(text: string): TabDoc {
  const lines = text.split('\n')
  const blocks = blocksOf(lines)
  if (blocks.length === 0) return { strings: 6, bars: [] }

  const strings = blocks[0]?.rows.length ?? 6
  const bars: Bar[] = []

  for (const block of blocks) {
    const perRow = block.rows.map((row) => barsOf(row))
    const barCount = Math.max(0, ...perRow.map((row) => row.length))
    const columns: number[][] = []
    const made: Bar[] = []

    for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
      const inBar = perRow.map((row) => row[barIndex]).filter((bar) => bar !== undefined)
      const shape = readBar(
        inBar.map((bar) => bar.content),
        inBar[0]?.at ?? 0
      )
      if (shape === null) continue

      const slots: Slot[] = shape.map((read) => {
        const slot = emptySlot(strings)
        read.texts.forEach((text, string) => {
          if (string >= strings || text === null || !isFret(text)) return
          slot.frets[string] = text as Fret
        })
        read.afters.forEach((join, string) => {
          if (string < strings) slot.after[string] = join
        })
        return slot
      })

      const slotColumns = shape.map((slot) => slot.at)
      const beats = intoBeats(slots, slotColumns, beatColumns(block.markers))
      markPositions(beats, slotColumns, block.markers)
      columns.push(slotColumns)
      made.push({ beats })
    }

    attachChords(made, columns, block.chords)
    bars.push(...made)
  }

  return { strings, bars }
}
