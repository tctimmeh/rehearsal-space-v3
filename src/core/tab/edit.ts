import {
  BEATS_MAX,
  BEATS_MIN,
  emptyBar,
  emptyBeat,
  emptySlot,
  HIGHEST_FRET,
  isFret,
  normalise,
  OFF_BEAT,
  ON_BEAT,
  barIsEmpty,
  type Bar,
  type Beat,
  type Cursor,
  type Sixteenth,
  type Slot,
  type TabDoc,
  type Technique
} from './document'
import { cursorAtPlace, laidOut, placeOf, WRAP_COLUMNS } from './render'

/**
 * Everything that happens when a key is pressed, as a function of what was
 * there before.
 *
 * None of this knows about the screen. A cursor is a bar, a beat, a slot and a
 * string; moving it and typing into it are ordinary operations on the
 * document, which is what makes them arguable in a test rather than only by
 * pressing keys and looking.
 */

export interface Editing {
  doc: TabDoc
  cursor: Cursor
}

/**
 * How long two digits can be apart and still be one fret.
 *
 * A wall clock in an editor is a poor thing to test against, so nothing here
 * reads one: the caller says how long it has been, and passes Infinity when
 * the cursor has moved in between, since a digit typed somewhere else is not a
 * continuation of this one.
 */
export const QUICK_MS = 500

export const AT_START: Cursor = { bar: 0, beat: 0, slot: 0, string: 0 }

const slotAt = (doc: TabDoc, cursor: Cursor): Slot | undefined =>
  doc.bars[cursor.bar]?.beats[cursor.beat]?.slots[cursor.slot]

export const fretAt = (doc: TabDoc, cursor: Cursor): string | null =>
  slotAt(doc, cursor)?.frets[cursor.string] ?? null

/** The slots of a bar in order, with which beat each belongs to. */
const flatten = (doc: TabDoc, bar: number): { beat: number; slot: number }[] => {
  const found: { beat: number; slot: number }[] = []
  doc.bars[bar]?.beats.forEach((beat, beatIndex) => {
    beat.slots.forEach((_, slotIndex) => found.push({ beat: beatIndex, slot: slotIndex }))
  })
  return found
}

const positionIn = (doc: TabDoc, cursor: Cursor): number =>
  flatten(doc, cursor.bar).findIndex(
    (place) => place.beat === cursor.beat && place.slot === cursor.slot
  )

const atPosition = (doc: TabDoc, bar: number, index: number, string: number): Cursor => {
  const slots = flatten(doc, bar)
  const held = slots[Math.max(0, Math.min(slots.length - 1, index))]
  return { bar, beat: held?.beat ?? 0, slot: held?.slot ?? 0, string }
}

/** Changes one slot without disturbing the rest of the document. */
function withSlot(doc: TabDoc, cursor: Cursor, change: (slot: Slot) => Slot): TabDoc {
  return {
    ...doc,
    bars: doc.bars.map((bar, barIndex) =>
      barIndex !== cursor.bar
        ? bar
        : {
            ...bar,
            beats: bar.beats.map((beat, beatIndex) =>
              beatIndex !== cursor.beat
                ? beat
                : {
                    ...beat,
                    slots: beat.slots.map((slot, slotIndex) =>
                      slotIndex !== cursor.slot ? slot : change(slot)
                    )
                  }
            )
          }
    )
  }
}

const put = (slot: Slot, string: number, fret: string | null): Slot => ({
  ...slot,
  frets: slot.frets.map((held, index) => (index === string ? fret : held))
})

/* ---------------------------------------------------------------- moving -- */

/** Left and right run along the slots and carry on into the next bar. */
export function moveLeft(state: Editing): Editing {
  const index = positionIn(state.doc, state.cursor)
  if (index > 0) {
    return { ...state, cursor: atPosition(state.doc, state.cursor.bar, index - 1, state.cursor.string) }
  }
  if (state.cursor.bar === 0) return state
  const previous = state.cursor.bar - 1
  return {
    ...state,
    cursor: atPosition(state.doc, previous, flatten(state.doc, previous).length - 1, state.cursor.string)
  }
}

export function moveRight(state: Editing): Editing {
  const index = positionIn(state.doc, state.cursor)
  const slots = flatten(state.doc, state.cursor.bar)
  if (index < slots.length - 1) {
    return { ...state, cursor: atPosition(state.doc, state.cursor.bar, index + 1, state.cursor.string) }
  }
  if (state.cursor.bar >= state.doc.bars.length - 1) return state
  return { ...state, cursor: atPosition(state.doc, state.cursor.bar + 1, 0, state.cursor.string) }
}

/**
 * Up and down go up and down the screen.
 *
 * Within a system that is simply the next string. Past the last one it is the
 * system above or below, and the cursor stays in the same column rather than
 * on the same beat — the bar underneath may be a different shape entirely, and
 * following the beat would send the cursor sideways, which is not what anybody
 * pressing an arrow meant.
 *
 * This is the one place the drawing reaches into the editing, and it has to:
 * "the line above" is a fact about how the thing is laid out.
 */
function moveByLine(state: Editing, by: -1 | 1, wrapAt: number): Editing {
  const string = state.cursor.string + by
  if (string >= 0 && string < state.doc.strings) {
    return { ...state, cursor: { ...state.cursor, string } }
  }

  const place = placeOf(state.doc, state.cursor, wrapAt)
  if (place === null) return state

  const laid = laidOut(state.doc, wrapAt)
  const next = laid[place.system + by]
  if (next === undefined) return state

  const line = by === -1 ? next.top + state.doc.strings - 1 : next.top
  const cursor = cursorAtPlace(state.doc, line, place.column, wrapAt)
  return cursor === null ? state : { ...state, cursor }
}

export const moveUp = (state: Editing, wrapAt = WRAP_COLUMNS): Editing =>
  moveByLine(state, -1, wrapAt)

export const moveDown = (state: Editing, wrapAt = WRAP_COLUMNS): Editing =>
  moveByLine(state, 1, wrapAt)

/* ---------------------------------------------------------------- typing -- */

/**
 * Types a digit into the slot under the cursor.
 *
 * The cursor stays where it is, so a second digit typed straight after
 * lengthens the fret rather than landing somewhere else — 1 then 2 is the
 * twelfth fret. Past the twenty-fourth there is no more neck, so a pair that
 * would go beyond it is read as the second digit starting again.
 */
export function typeFret(state: Editing, digit: string, sinceMs: number): Editing {
  if (!/^\d$/.test(digit)) return state
  const held = fretAt(state.doc, state.cursor)
  const joined = held !== null && /^\d$/.test(held) && sinceMs <= QUICK_MS ? held + digit : digit
  const fret = isFret(joined) && Number(joined) <= HIGHEST_FRET ? joined : digit
  return { ...state, doc: withSlot(state.doc, state.cursor, (slot) => put(slot, state.cursor.string, fret)) }
}

/** A string played without a note on it. */
export const typeMute = (state: Editing): Editing => ({
  ...state,
  doc: withSlot(state.doc, state.cursor, (slot) => put(slot, state.cursor.string, 'x'))
})

export const deleteNote = (state: Editing): Editing => ({
  ...state,
  doc: withSlot(state.doc, state.cursor, (slot) => put(slot, state.cursor.string, null))
})

/**
 * Writes a technique in the column after the note under the cursor.
 *
 * A slide or a hammer-on goes there because that is where it belongs: it is
 * what happens between two notes rather than anything either of them does. A
 * staccato goes there because there is nowhere else — it is a mark on the note
 * before it. Typing the one already there takes it off again, and typing a
 * different one replaces it.
 */
export function markWith(state: Editing, technique: Technique): Editing {
  const held = slotAt(state.doc, state.cursor)?.after[state.cursor.string] ?? '-'
  const wanted = held === technique ? '-' : technique
  return {
    ...state,
    doc: withSlot(state.doc, state.cursor, (slot) => ({
      ...slot,
      after: slot.after.map((join, index) => (index === state.cursor.string ? wanted : join))
    }))
  }
}

/**
 * Writes the chord above the beat the cursor is in.
 *
 * Above the beat rather than at a column, so that widening the bar underneath
 * carries the chord with it instead of leaving it pointing at the wrong place.
 */
export const nameChord = (state: Editing, chord: string): Editing => ({
  ...state,
  doc: withBeat(state.doc, state.cursor, (beat) => ({
    ...beat,
    chord: chord.trim() === '' ? null : chord.trim()
  }))
})

export const chordAt = (doc: TabDoc, cursor: Cursor): string =>
  doc.bars[cursor.bar]?.beats[cursor.beat]?.chord ?? ''

/* ---------------------------------------------------------------- rhythm -- */

/** Changes one beat, leaving the rest of the document as it was. */
function withBeat(doc: TabDoc, at: Cursor, change: (beat: Beat) => Beat): TabDoc {
  return {
    ...doc,
    bars: doc.bars.map((bar, barIndex) =>
      barIndex !== at.bar
        ? bar
        : {
            ...bar,
            beats: bar.beats.map((beat, beatIndex) =>
              beatIndex !== at.beat ? beat : change(beat)
            )
          }
    )
  }
}

const holds = (beat: Beat, at: Sixteenth): boolean => beat.slots.some((slot) => slot.at === at)

const withSixteenth = (beat: Beat, at: Sixteenth, strings: number): Beat => ({
  ...beat,
  slots: [...beat.slots, emptySlot(strings, at)].sort((one, other) => one.at - other.at)
})

/**
 * Makes room for a sixteenth beside the cursor, and stands on it.
 *
 * A beat is the beat and its eighth; the two sixteenths between them are added
 * one at a time, which is what the arrow means. To the right of the beat is
 * its `e`, to the right of the eighth is its `a`, and to the left of a beat is
 * the `a` of the beat before it — so the same gap can be opened from either
 * side of it, whichever the cursor happens to be standing on.
 */
export function subdivide(state: Editing, towards: -1 | 1): Editing {
  const { doc, cursor } = state
  const beat = doc.bars[cursor.bar]?.beats[cursor.beat]
  const here = beat?.slots[cursor.slot]
  if (beat === undefined || here === undefined) return state

  /* To the left of a beat is the end of the one before it. */
  if (towards === -1 && here.at === ON_BEAT) {
    const before = beforeBeat(state)
    return before === null ? state : subdivideAt(state, before, 3)
  }

  const wanted: Sixteenth | null =
    towards === 1
      ? here.at === ON_BEAT
        ? 1
        : here.at === OFF_BEAT
          ? 3
          : null
      : here.at === OFF_BEAT
        ? 1
        : null

  return wanted === null ? state : subdivideAt(state, cursor, wanted)
}

/** The last beat before the cursor's, which may be in the bar before it. */
function beforeBeat(state: Editing): Cursor | null {
  const { doc, cursor } = state
  if (cursor.beat > 0) return { ...cursor, beat: cursor.beat - 1, slot: 0 }
  if (cursor.bar === 0) return null
  const bar = doc.bars[cursor.bar - 1]
  if (bar === undefined) return null
  return { ...cursor, bar: cursor.bar - 1, beat: bar.beats.length - 1, slot: 0 }
}

function subdivideAt(state: Editing, at: Cursor, wanted: Sixteenth): Editing {
  const beat = state.doc.bars[at.bar]?.beats[at.beat]
  if (beat === undefined) return state

  const doc = holds(beat, wanted)
    ? state.doc
    : withBeat(state.doc, at, (found) => withSixteenth(found, wanted, state.doc.strings))

  const slots = doc.bars[at.bar]?.beats[at.beat]?.slots ?? []
  const slot = slots.findIndex((one) => one.at === wanted)
  return { doc, cursor: { ...at, slot: Math.max(0, slot) } }
}

/**
 * Changes how many beats the bar under the cursor is in.
 *
 * Three to twelve. If nothing after this bar has been written yet then this is
 * not a change to one bar but a decision about the piece, so the empty bars
 * after it follow — otherwise only the bar under the cursor changes, and the
 * music already written keeps the shape it was written in.
 */
export function setBeats(state: Editing, beats: number): Editing {
  const { doc, cursor } = state
  const wanted = Math.max(BEATS_MIN, Math.min(BEATS_MAX, beats))
  const here = doc.bars[cursor.bar]
  if (here === undefined || here.beats.length === wanted) return state

  const rest = doc.bars.slice(cursor.bar + 1)
  const followsOn = rest.every(barIsEmpty)

  const bars = doc.bars.map((bar, index) => {
    if (index < cursor.bar) return bar
    if (index > cursor.bar && !followsOn) return bar
    return inBeats(bar, wanted, doc.strings)
  })

  const beat = Math.min(cursor.beat, wanted - 1)
  const slot = Math.min(cursor.slot, (bars[cursor.bar]?.beats[beat]?.slots.length ?? 1) - 1)
  return { doc: { ...doc, bars }, cursor: { ...cursor, beat, slot: Math.max(0, slot) } }
}

/** Lengthens a bar with empty beats, or shortens it from the end. */
const inBeats = (bar: Bar, beats: number, strings: number): Bar => ({
  ...bar,
  beats:
    bar.beats.length >= beats
      ? bar.beats.slice(0, beats)
      : [
          ...bar.beats,
          ...Array.from({ length: beats - bar.beats.length }, () => emptyBeat(strings))
        ]
})

/**
 * Marks where a repeat begins or ends, whichever half of the bar is under the
 * cursor.
 *
 * Which half decides which, because that is where the mark is drawn: a repeat
 * begins at the left-hand line of its first bar and ends at the right-hand
 * line of its last, and pointing at the half nearest the line you mean is the
 * only thing anybody has to remember.
 *
 * Pressing it again on a mark takes it off. A repeat's count is set separately
 * — there is nothing to count until there is an end to count round to.
 */
export function markRepeat(state: Editing): Editing {
  const { doc, cursor } = state
  const bar = doc.bars[cursor.bar]
  if (bar === undefined) return state

  const ends = cursor.beat >= bar.beats.length / 2
  const changed = ends ? closesRepeat(bar) : opensRepeat(bar)
  return {
    ...state,
    doc: { ...doc, bars: doc.bars.map((one, index) => (index === cursor.bar ? changed : one)) }
  }
}

const opensRepeat = (bar: Bar): Bar => {
  if (bar.repeatStart !== true) return { ...bar, repeatStart: true }
  const { repeatStart: _off, ...rest } = bar
  return rest
}

/* Marking the end of a repeat leaves it going round once, which is what a
   repeat means before anybody says otherwise. Pressing again does not take it
   off — the count is asked for instead, and nought is how it is cleared. */
const closesRepeat = (bar: Bar): Bar =>
  bar.repeatTimes === undefined ? { ...bar, repeatTimes: 1 } : bar

/**
 * How many times the repeat goes round, on the bar it ends at.
 *
 * Nought times is not a repeat at all, so it is how the mark is taken off.
 */
export function timesRound(state: Editing, times: number): Editing {
  const { doc, cursor } = state
  const bar = doc.bars[cursor.bar]
  if (bar === undefined || bar.repeatTimes === undefined) return state
  const changed = ((): Bar => {
    if (times >= 1) return { ...bar, repeatTimes: times }
    const { repeatTimes: _off, ...rest } = bar
    return rest
  })()
  return {
    ...state,
    doc: { ...doc, bars: doc.bars.map((one, index) => (index === cursor.bar ? changed : one)) }
  }
}

/** The slot the cursor is standing on, changed and put back. */
function atCursor(state: Editing, change: (slot: Slot) => Slot): Editing {
  const { doc, cursor } = state
  return {
    ...state,
    doc: {
      ...doc,
      bars: doc.bars.map((bar, barIndex) =>
        barIndex !== cursor.bar
          ? bar
          : {
              ...bar,
              beats: bar.beats.map((beat, beatIndex) =>
                beatIndex !== cursor.beat
                  ? beat
                  : {
                      ...beat,
                      slots: beat.slots.map((slot, slotIndex) =>
                        slotIndex !== cursor.slot ? slot : change(slot)
                      )
                    }
              )
            }
      )
    }
  }
}

/**
 * Damped with the heel of the hand, or not.
 *
 * The moment is damped rather than the string: the hand lands on the strings,
 * so it is one mark above the staff however many notes are under it.
 */
export const palmMute = (state: Editing): Editing =>
  atCursor(state, (slot) => {
    if (slot.palm === true) {
      const { palm: _off, ...rest } = slot
      return rest
    }
    return { ...slot, palm: true }
  })

/**
 * Half a beat more vibrato, or half a beat less.
 *
 * Counted in half beats because that is the shortest wave worth drawing, and
 * because holding a note and shaking it for exactly one is what the key is
 * pressed once to mean.
 */
export const shakeBy = (state: Editing, halves: number): Editing =>
  atCursor(state, (slot) => {
    const held = Math.max(0, (slot.vibrato ?? 0) + halves)
    if (held === 0) {
      const { vibrato: _still, ...rest } = slot
      return rest
    }
    return { ...slot, vibrato: held }
  })

/**
 * Every section ends with exactly one empty bar.
 *
 * One, because that is somewhere to carry on writing: the document as a whole
 * has always kept a spare at its end, and a section with another section after
 * it had none, since the next section's first bar came straight after its
 * last. Exactly one, because emptying the bars off the end of a section should
 * close the gap the same way emptying them off the end of the file does —
 * otherwise a section keeps whatever room it was once given.
 *
 * The cursor comes along. Bars put in above it move it down, bars taken out
 * above it move it up, and a cursor standing in a bar that has gone is put on
 * the one kept in its place.
 */
export function withRoomToCarryOn(state: Editing): Editing {
  const { doc, cursor } = state
  const bars: Bar[] = []
  let bar = cursor.bar

  doc.bars.forEach((one, index) => {
    if (one.opens !== undefined && bars.length > 0) {
      let spares = 0
      while (spares < bars.length && spareAt(bars, bars.length - 1 - spares)) spares += 1

      if (spares === 0) {
        const before = bars[bars.length - 1] as Bar
        bars.push(emptyBar(doc.strings, before.beats.length))
        if (cursor.bar >= index) bar += 1
      } else if (spares > 1) {
        const dropped = spares - 1
        bars.length -= dropped
        if (cursor.bar >= index) bar -= dropped
        else if (cursor.bar > index - spares) bar = bars.length - 1
      }
    }
    bars.push(one)
  })

  if (bars.length === doc.bars.length) return state
  return { doc: { ...doc, bars }, cursor: { ...cursor, bar } }
}

/** A bar that is empty and starts nothing, which is what a spare one is. */
const spareAt = (bars: Bar[], at: number): boolean => {
  const bar = bars[at]
  return bar !== undefined && bar.opens === undefined && barIsEmpty(bar)
}

/**
 * Opens a section at the bar the cursor is in.
 *
 * The bar becomes the first of a new system with room above it for a name or a
 * note on how to play what follows. Nothing is written there yet — that is the
 * point, the words come next — and a section left unnamed closes itself again
 * once the cursor leaves.
 *
 * A bar that already opens one is left alone rather than emptied, so pressing
 * it twice does not throw away what was written.
 */
export function openSection(state: Editing): Editing {
  const { doc, cursor } = state
  const bar = doc.bars[cursor.bar]
  if (bar === undefined || bar.opens !== undefined) return state
  const opened = {
    ...state,
    doc: {
      ...doc,
      bars: doc.bars.map((one, index) => (index === cursor.bar ? { ...one, opens: '' } : one))
    }
  }
  /* The section left above this one needs a bar to carry on in, and putting
     one there moves this bar down past it. */
  return withRoomToCarryOn(opened)
}

/** What is written above the section the cursor's bar belongs to. */
export function sectionAt(doc: TabDoc, cursor: Cursor): { bar: number; text: string } | null {
  for (let index = Math.min(cursor.bar, doc.bars.length - 1); index >= 0; index -= 1) {
    const opens = doc.bars[index]?.opens
    if (opens !== undefined) return { bar: index, text: opens }
  }
  return null
}

/** Writes the words above a section, which is where a section's name lives. */
export function nameSection(doc: TabDoc, bar: number, text: string): TabDoc {
  if (doc.bars[bar]?.opens === undefined || doc.bars[bar]?.opens === text) return doc
  return {
    ...doc,
    bars: doc.bars.map((one, index) => (index === bar ? { ...one, opens: text } : one))
  }
}

/**
 * Tidies up and keeps the cursor somewhere real.
 *
 * The beat the cursor is standing in is left as it is: emptying a sixteenth
 * should not close the gap under somebody who is about to type into it. It
 * closes when they leave, which is what calling this on every move amounts to.
 */
export function settle(state: Editing): Editing {
  const spaced = withRoomToCarryOn(state)
  const doc = normalise(spaced.doc, { bar: spaced.cursor.bar, beat: spaced.cursor.beat })
  const bar = Math.min(spaced.cursor.bar, doc.bars.length - 1)
  const index = Math.min(positionIn(spaced.doc, spaced.cursor), flatten(doc, bar).length - 1)
  const string = Math.max(0, Math.min(spaced.cursor.string, doc.strings - 1))
  return { doc, cursor: atPosition(doc, bar, Math.max(0, index), string) }
}
