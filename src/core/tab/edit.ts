import {
  HIGHEST_FRET,
  isFret,
  normalise,
  type Cursor,
  type Slot,
  type TabDoc
} from './document'
import { layOut, WRAP_COLUMNS } from './render'

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
 * Which bars are drawn on a line together, so that up and down can leave the
 * strings and go to the bar above or below rather than stopping dead.
 *
 * This is the one place the layout reaches into editing, and it has to: "the
 * bar above" is a fact about how the thing is drawn, not about the music.
 */
const systemOf = (doc: TabDoc, bar: number, wrapAt: number): { first: number; count: number } => {
  let first = 0
  for (const system of layOut(doc, wrapAt)) {
    const count = system.bars.length
    if (bar < first + count) return { first, count }
    first += count
  }
  return { first: 0, count: doc.bars.length }
}

export function moveUp(state: Editing, wrapAt = WRAP_COLUMNS): Editing {
  if (state.cursor.string > 0) {
    return { ...state, cursor: { ...state.cursor, string: state.cursor.string - 1 } }
  }
  const here = systemOf(state.doc, state.cursor.bar, wrapAt)
  if (here.first === 0) return state
  const above = systemOf(state.doc, here.first - 1, wrapAt)
  const across = state.cursor.bar - here.first
  const bar = Math.min(above.first + across, here.first - 1)
  return {
    ...state,
    cursor: atPosition(state.doc, bar, positionIn(state.doc, state.cursor), state.doc.strings - 1)
  }
}

export function moveDown(state: Editing, wrapAt = WRAP_COLUMNS): Editing {
  if (state.cursor.string < state.doc.strings - 1) {
    return { ...state, cursor: { ...state.cursor, string: state.cursor.string + 1 } }
  }
  const here = systemOf(state.doc, state.cursor.bar, wrapAt)
  const next = here.first + here.count
  if (next >= state.doc.bars.length) return state
  const below = systemOf(state.doc, next, wrapAt)
  const across = state.cursor.bar - here.first
  const bar = Math.min(below.first + across, below.first + below.count - 1)
  return { ...state, cursor: atPosition(state.doc, bar, positionIn(state.doc, state.cursor), 0) }
}

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
