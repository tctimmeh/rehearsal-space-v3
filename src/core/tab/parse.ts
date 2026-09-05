import {
  emptySlot,
  isFret,
  ON_BEAT,
  OFF_BEAT,
  TECHNIQUES,
  type Beat,
  type Bar,
  type Fret,
  type Division,
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
  TECHNIQUES.includes(character as Technique)

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
function readBar(contents: string[], from: number): { into: Technique[]; slots: ReadSlot[] } | null {
  /* The column a bar opens with is a dash, or what comes into its first note. */
  const opening = contents.map((content) => content[0] ?? '')
  if (contents.length === 0 || !opening.every(isTechnique)) return null
  const into = opening.map((character) => character as Technique)

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

  return { into, slots }
}

/** A line of the tablature itself, rather than of the writing around it. */
const isStringRow = (line: string): boolean => line.trimStart().startsWith('|')

/** What the picking hand is doing: palm mutes and vibrato, and nothing else. */
const isHandRow = (line: string): boolean =>
  line.trim() !== '' && [...line].every((character) => character === ' ' || 'x~'.includes(character))

/* The `x` of a repeat count is written on this line too, so it belongs to the
   alphabet: without it a bar that says how many times round is not recognised
   as the beats at all, and the rhythm falls back to a guess. */
const isMarkerRow = (line: string): boolean =>
  !line.includes('|') && /\d/.test(line) && /^[\s\d&eax]*$/.test(line)

interface Block {
  chords: string | null
  markers: string | null
  /** Palm mutes and vibrato, written under the beats. */
  hand: string | null
  /** Free text written above this system, which is what opens a section. */
  words: string | null
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

    const start = at - rows.length
    /* Written under the beats and over the strings, so it is looked for
       first — otherwise a row of palm mutes stands where the beats should be
       and the beats are never found. */
    const hand = start > 0 && isHandRow(lines[start - 1] as string) ? lines[start - 1] : null
    const marksAt = hand === null ? start - 1 : start - 2
    const markers = marksAt >= 0 && isMarkerRow(lines[marksAt] as string) ? lines[marksAt] : null
    const chordsAt = markers === null ? marksAt : marksAt - 1
    const candidate = chordsAt >= 0 ? (lines[chordsAt] as string) : ''
    const chords =
      chordsAt >= 0 && candidate.trim() !== '' && !candidate.includes('|') && !isMarkerRow(candidate)
        ? candidate
        : null
    const above = chords !== null ? chordsAt : markers !== null ? marksAt : start

    blocks.push({
      chords: chords ?? null,
      markers: markers ?? null,
      hand: hand ?? null,
      words: wordsAbove(lines, above),
      rows
    })
  }

  return blocks
}

/**
 * The words written above a system, if any are.
 *
 * A paragraph of its own, separated from the system by a blank line — which is
 * what tells it apart from the chords, since those are written hard against
 * the beats. Anything directly above with no blank line between is the chord
 * line and has already been taken as one.
 *
 * Nothing above but the previous system's own rows means this system carries
 * straight on from it rather than opening a section.
 */
function wordsAbove(lines: string[], above: number): string | null {
  /* Exactly one blank line stands between the words and the system they
     introduce, and exactly one between them and whatever came before. Any
     others belong to the words: somebody left room there on purpose, and a
     paragraph that loses its own blank lines every time it is read back is
     not somewhere anybody can lay anything out. */
  let end = above - 1
  if (end < 0 || (lines[end] as string).trim() !== '') return null
  end -= 1

  let begin = end
  while (begin >= 0 && !isStringRow(lines[begin] as string)) begin -= 1

  const words = lines.slice(begin + 1, end + 1)
  /* The one that separated these from the block above, where there was one.
     At the top of the file nothing came before, so nothing is dropped. */
  if (begin >= 0 && (words[0] as string | undefined)?.trim() === '') words.shift()

  return words.length > 0 ? words.join('\n') : null
}

/**
 * Where each bar of a row begins, and what is between the lines.
 *
 * A repeat's line is drawn twice, which leaves nothing at all between the two
 * — a gap rather than a bar, and not something to try to read notes out of.
 */
function barsOf(row: string): { content: string; at: number }[] {
  const bars: { content: string; at: number }[] = []
  let at = row.indexOf('|')
  while (at !== -1) {
    const next = row.indexOf('|', at + 1)
    if (next === -1) break
    if (next > at + 1) bars.push({ content: row.slice(at + 1, next), at: at + 1 })
    at = next
  }
  return bars
}

/**
 * The beat numbers with the repeat counts taken out.
 *
 * "x12" over the end of a bar is how many times round, not a beat, and its
 * digits would otherwise be read as one — putting a beat where the bar ends
 * and throwing off every slot after it.
 */
const withoutCounts = (markers: string): string =>
  markers.replace(/x\d+/g, (mark) => ' '.repeat(mark.length))

/** The columns the beat numbers sit on, which is where the beats begin. */
const beatColumns = (markers: string | null): number[] =>
  markers === null ? [] : [...withoutCounts(markers).matchAll(/\d+/g)].map((match) => match.index)

/** How many times round, written over the column the bar ends on. */
function timesRound(markers: string | null, from: number, to: number): number | null {
  if (markers === null) return null
  for (const match of markers.matchAll(/x(\d+)/g)) {
    if (match.index >= from && match.index < to) return Number(match[1])
  }
  return null
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

/**
 * Reads the palm mutes and vibrato back onto the slots they were drawn over.
 *
 * A wave runs on from its note, so its length is counted from where it starts
 * until something else is written or it stops — and how many half-beats that
 * was is the inverse of how it was drawn.
 */
function readHand(slots: Slot[], columns: number[], hand: string | null): void {
  if (hand === null) return
  slots.forEach((slot, index) => {
    const column = columns[index] ?? 0
    if (hand[column] === 'x') slot.palm = true
    if (hand[column] !== '~') return
    let run = 0
    while (hand[column + run] === '~') run += 1
    slot.vibrato = Math.round((run + 1) / 2)
  })
}

/** Says where in its beat each slot stands, now that the beats are known. */
function markPositions(beats: Beat[], columns: number[], markers: string | null): void {
  let index = 0
  for (const beat of beats) {
    const marks = beat.slots.map((_, offset) => markers?.[columns[index + offset] ?? 0] ?? ' ')
    const threes = threesFrom(beat, marks)

    if (threes !== undefined) {
      beat.division = threes
      beat.slots.forEach((slot, offset) => {
        slot.at = offset
      })
    } else {
      const { division, positions } = halvesFrom(beat, marks)
      if (division !== undefined) beat.division = division
      beat.slots.forEach((slot, offset) => {
        slot.at = positions[offset] ?? ON_BEAT
      })
    }

    index += beat.slots.length
  }
}

/**
 * Threes, where nothing else could have been drawn this way.
 *
 * Nothing at all is written over a beat in threes, and every beat in halves
 * holding three slots has an `e` or an `a` over one of them. Sixes carry the
 * one `&` where their second three begins, and nothing else.
 */
function threesFrom(beat: Beat, marks: string[]): Division | undefined {
  if (marks.some((mark) => mark === 'e' || mark === 'a')) return undefined
  const ampersands = marks.filter((mark) => mark === '&').length
  if (ampersands === 0) return beat.slots.length === 3 ? 3 : undefined
  return ampersands === 1 && beat.slots.length === 6 && marks[3] === '&' ? 6 : undefined
}

/**
 * Where the slots of a beat in halves fall.
 *
 * The `e`, `&` and `a` pin the quarters of the beat. Anything unmarked between
 * two of them is a thirty-second — there is nothing written over one, because
 * there is nothing to call it — and one of those anywhere in the beat means
 * every place in it is counted in eighths of a beat rather than quarters.
 */
function halvesFrom(
  beat: Beat,
  marks: string[]
): { division: Division | undefined; positions: number[] } {
  /* Two slots with nothing written over them can only be the beat and its
     eighth: that is what a beat is, and nothing is drawn to say so. The first
     slot is passed over — what stands there is the beat's own number. */
  if (beat.slots.length === 2 && marks.slice(1).every((mark) => mark === ' ')) {
    return { division: undefined, positions: [ON_BEAT, OFF_BEAT] }
  }

  const quarters: number[] = []
  const between: number[] = []
  let quarter = 0
  let sub = 0

  marks.forEach((mark, offset) => {
    if (offset === 0) sub = 0
    else if (mark === 'e') (quarter = 1), (sub = 0)
    else if (mark === '&') (quarter = 2), (sub = 0)
    else if (mark === 'a') (quarter = 3), (sub = 0)
    else sub += 1
    quarters.push(quarter)
    between.push(sub)
  })

  const finer = between.some((offset) => offset > 0)
  const step = finer ? 2 : 1
  return {
    division: finer ? 8 : undefined,
    positions: quarters.map((held, offset) => held * step + (between[offset] ?? 0))
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
      /* A repeat's dots stand in the always-empty columns at either end. They
         are read off and put back as dashes, so the columns walk as they
         always did. */
      const dots = inBar.map((bar) => bar.content)
      const repeatStart = dots.some((content) => content.startsWith(':'))
      const repeatEnd = dots.some((content) => content.endsWith(':'))
      /* The dot has a column of its own, so it is taken off rather than read
         as a dash: leaving it there would put an extra column at the front of
         the bar and land every slot after it one place out. */
      const shape = readBar(
        dots.map((content) =>
          content.slice(repeatStart ? 1 : 0, repeatEnd ? -1 : undefined)
        ),
        (inBar[0]?.at ?? 0) + (repeatStart ? 1 : 0)
      )
      if (shape === null) continue

      const slots: Slot[] = shape.slots.map((read) => {
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

      const slotColumns = shape.slots.map((slot) => slot.at)
      readHand(slots, slotColumns, block.hand)
      const beats = intoBeats(slots, slotColumns, beatColumns(block.markers))
      markPositions(beats, slotColumns, block.markers)
      columns.push(slotColumns)
      const bar: Bar = { beats }
      const into = Array.from(
        { length: strings },
        (_, string) => shape.into[string] ?? ('-' as Technique)
      )
      if (into.some((join) => join !== '-')) bar.into = into
      if (repeatStart) bar.repeatStart = true
      if (repeatEnd) {
        const from = inBar[0]?.at ?? 0
        /* The count reaches past the bar's own columns and stands over the
           outer of the two lines that close it. */
        const span = (inBar[0]?.content.length ?? 0) + 2
        bar.repeatTimes = timesRound(block.markers, from, from + span) ?? 1
      }
      made.push(bar)
    }

    attachChords(made, columns, block.chords)
    /* The words belong to the first bar under them, which is the bar that
       opens the section they introduce. */
    if (block.words !== null && made[0] !== undefined) made[0].opens = block.words
    bars.push(...made)
  }

  return { strings, bars }
}
