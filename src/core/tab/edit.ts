import {
  HIGHEST_FRET,
  isFret,
  normalise,
  type Cursor,
  type Slot,
  type TabDoc
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
 * Tidies up and keeps the cursor somewhere real.
 *
 * Called when the cursor leaves a beat rather than on every keystroke, because
 * collapsing an emptied sixteenth under whoever is typing moves the ground
 * they are standing on.
 */
export function settle(state: Editing): Editing {
  const doc = normalise(state.doc)
  const bar = Math.min(state.cursor.bar, doc.bars.length - 1)
  const index = Math.min(positionIn(state.doc, state.cursor), flatten(doc, bar).length - 1)
  const string = Math.max(0, Math.min(state.cursor.string, doc.strings - 1))
  return { doc, cursor: atPosition(doc, bar, Math.max(0, index), string) }
}
