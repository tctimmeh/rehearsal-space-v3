import {
  emptyBar,
  emptySlot,
  OFF_BEAT,
  ON_BEAT,
  slotIsEmpty,
  type Bar,
  type Beat,
  type Cursor,
  type Division,
  type Slot,
  type TabDoc
} from './document'

/**
 * Taking a stretch of tablature away, and putting one back.
 *
 * A selection is whole beats, never part of one — the sketch says columns, and
 * a beat is the column. Which strings were picked does not come into it: a
 * bar's worth of music is all six at once, and copying the top string alone
 * would be copying a shape nobody played.
 *
 * Beats are counted straight through the document rather than as a bar and an
 * offset, because a selection runs across bar lines as readily as within one.
 */
export interface Span {
  /** Both ends included. */
  from: number
  to: number
}

export const totalBeats = (doc: TabDoc): number =>
  doc.bars.reduce((count, bar) => count + bar.beats.length, 0)

export function beatIndexOf(doc: TabDoc, cursor: Cursor): number {
  let index = 0
  for (let bar = 0; bar < cursor.bar; bar += 1) index += doc.bars[bar]?.beats.length ?? 0
  return index + cursor.beat
}

export function beatAtIndex(doc: TabDoc, index: number): { bar: number; beat: number } | null {
  let left = index
  for (const [bar, held] of doc.bars.entries()) {
    if (left < held.beats.length) return { bar, beat: left }
    left -= held.beats.length
  }
  return null
}

const ordered = (span: Span): Span => ({
  from: Math.min(span.from, span.to),
  to: Math.max(span.from, span.to)
})

/** Every beat in a span, deeply enough that editing one will not reach back. */
export function copyBeats(doc: TabDoc, span: Span): Beat[] {
  const { from, to } = ordered(span)
  const taken: Beat[] = []
  for (let index = from; index <= to; index += 1) {
    const at = beatAtIndex(doc, index)
    const beat = at === null ? undefined : doc.bars[at.bar]?.beats[at.beat]
    if (beat !== undefined) taken.push(cloneBeat(beat))
  }
  return taken
}

const cloneBeat = (beat: Beat): Beat => ({
  chord: beat.chord,
  ...(beat.division === undefined ? {} : { division: beat.division }),
  slots: beat.slots.map((slot) => ({
    ...slot,
    frets: [...slot.frets],
    after: [...slot.after]
  }))
})

/** Empties the notes out of a span, leaving the rhythm it was played in. */
export function clearBeats(doc: TabDoc, span: Span): TabDoc {
  const { from, to } = ordered(span)
  let index = 0
  return {
    ...doc,
    bars: doc.bars.map((bar) => ({
      ...bar,
      beats: bar.beats.map((beat) => {
        const here = index
        index += 1
        if (here < from || here > to) return beat
        return {
          chord: null,
          slots: beat.slots.map((slot) => emptySlot(doc.strings, slot.at))
        }
      })
    }))
  }
}

/**
 * Writes beats in over whatever is at the cursor.
 *
 * Whole beats replace whole beats, so the rhythm of what was copied comes with
 * it — a beat in sixteenths pasted over a plain one brings its sixteenths, and
 * the drawing widens to suit. Running off the end adds bars rather than
 * quietly dropping what would not fit.
 */
export function pasteBeats(doc: TabDoc, at: Cursor, beats: Beat[]): TabDoc {
  if (beats.length === 0) return doc

  const start = beatIndexOf(doc, at)
  const shape = doc.bars[at.bar]?.beats.length ?? 4
  const bars: Bar[] = doc.bars.map((bar) => ({ ...bar, beats: [...bar.beats] }))

  while (totalBeats({ ...doc, bars }) < start + beats.length) {
    bars.push(emptyBar(doc.strings, shape))
  }

  beats.forEach((beat, offset) => {
    const place = beatAtIndex({ ...doc, bars }, start + offset)
    const bar = place === null ? undefined : bars[place.bar]
    if (place !== null && bar !== undefined) bar.beats[place.beat] = cloneBeat(beat)
  })

  return { ...doc, bars }
}

/** The copied beats as a document of their own, for drawing onto a clipboard. */
export const asDocument = (beats: Beat[], strings: number): TabDoc => ({
  strings,
  bars: [{ beats: beats.map(cloneBeat) }]
})

/** Which way round the cycle a beat goes: halves, then threes, then sixes. */
const nextDivision = (beat: Beat | undefined): Division | undefined =>
  beat?.division === undefined ? 3 : beat.division === 3 ? 6 : undefined

const positionsFor = (division: Division | undefined): number[] =>
  division === undefined ? [ON_BEAT, OFF_BEAT] : Array.from({ length: division }, (_, at) => at)

/** Where a slot falls in its beat, as a fraction of the beat. */
const fractionOf = (beat: Beat, slot: Slot): number => slot.at / (beat.division ?? 4)

/**
 * Puts one beat on a different grid, keeping what will fit.
 *
 * A note goes to whichever of the new slots falls nearest to where it was
 * played, which is the only answer that is right for a beat that is being
 * evenly redivided. Where two land on the same slot the earlier one keeps it:
 * three notes do not go into two places, and something has to give.
 */
function redivide(beat: Beat, division: Division | undefined, strings: number): Beat {
  const positions = positionsFor(division)
  const grid = division ?? 4
  const slots = positions.map((at) => emptySlot(strings, at))

  for (const held of beat.slots) {
    if (slotIsEmpty(held)) continue
    const played = fractionOf(beat, held)
    const best = positions.reduce(
      (near, at, index) =>
        Math.abs(at / grid - played) < Math.abs((positions[near] ?? 0) / grid - played) ? index : near,
      0
    )
    if (slots[best] === undefined || !slotIsEmpty(slots[best] as Slot)) continue
    slots[best] = { ...held, at: positions[best] ?? 0 }
  }

  return division === undefined
    ? { chord: beat.chord, slots }
    : { chord: beat.chord, slots, division }
}

/**
 * Takes every beat in a span one step round the cycle: halves, threes, sixes.
 *
 * Which step is decided once, from the first beat, so that a selection moves
 * together instead of every beat in it going its own way.
 */
export function divideBeats(doc: TabDoc, span: Span): TabDoc {
  const { from, to } = ordered(span)
  const first = beatAtIndex(doc, from)
  const wanted = nextDivision(
    first === null ? undefined : doc.bars[first.bar]?.beats[first.beat]
  )

  let index = 0
  return {
    ...doc,
    bars: doc.bars.map((bar) => ({
      ...bar,
      beats: bar.beats.map((beat) => {
        const here = index
        index += 1
        return here < from || here > to ? beat : redivide(beat, wanted, doc.strings)
      })
    }))
  }
}
