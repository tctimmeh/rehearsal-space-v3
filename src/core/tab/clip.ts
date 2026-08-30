import { emptyBar, emptySlot, type Bar, type Beat, type Cursor, type TabDoc } from './document'

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
  slots: beat.slots.map((slot) => ({
    at: slot.at,
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
  const bars: Bar[] = doc.bars.map((bar) => ({ beats: [...bar.beats] }))

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
