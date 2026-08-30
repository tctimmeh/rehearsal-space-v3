import { describe, expect, it } from 'vitest'

import { newTab, type Cursor, type TabDoc } from './document'
import {
  AT_START,
  deleteNote,
  fretAt,
  moveDown,
  moveLeft,
  moveRight,
  moveUp,
  QUICK_MS,
  chordAt,
  joinWith,
  nameChord,
  setBeats,
  settle,
  subdivide,
  typeFret,
  typeMute,
  type Editing
} from './edit'
import { cursorAtPlace, placeOf, render } from './render'

const start = (bars = 1): Editing => ({
  doc: { ...newTab(6), bars: newTab(6).bars.concat(Array.from({ length: bars - 1 }, () => newTab(6).bars[0] as never)) },
  cursor: AT_START
})

const at = (state: Editing): Cursor => state.cursor
const type = (state: Editing, digits: string, sinceMs = QUICK_MS): Editing =>
  [...digits].reduce((held, digit) => typeFret(held, digit, sinceMs), state)

describe('typing a fret', () => {
  it('puts it on the string under the cursor', () => {
    const state = typeFret(start(), '7', Infinity)

    expect(fretAt(state.doc, state.cursor)).toBe('7')
  })

  /* The cursor stays put, so the next digit lengthens the number rather than
     landing somewhere else. */
  it('makes one number of two digits typed together', () => {
    expect(fretAt(type(start(), '12').doc, AT_START)).toBe('12')
  })

  it('starts again when the second digit comes too late', () => {
    const first = typeFret(start(), '1', Infinity)
    const second = typeFret(first, '2', QUICK_MS + 1)

    expect(fretAt(second.doc, AT_START)).toBe('2')
  })

  /* There is no twenty-fifth fret, so the pair is read as a fresh digit. */
  it('refuses to go past the end of the neck', () => {
    expect(fretAt(type(start(), '25').doc, AT_START)).toBe('5')
    expect(fretAt(type(start(), '24').doc, AT_START)).toBe('24')
  })

  it('leaves the other strings alone', () => {
    const state = typeFret(start(), '9', Infinity)

    expect(state.doc.bars[0]?.beats[0]?.slots[0]?.frets[1]).toBeNull()
  })

  it('writes a mute where a fret would go', () => {
    expect(fretAt(typeMute(start()).doc, AT_START)).toBe('x')
  })

  it('takes a note away again', () => {
    const state = deleteNote(typeFret(start(), '7', Infinity))

    expect(fretAt(state.doc, AT_START)).toBeNull()
  })
})

describe('moving about', () => {
  it('runs along the slots', () => {
    expect(at(moveRight(start()))).toMatchObject({ beat: 0, slot: 1 })
    expect(at(moveRight(moveRight(start())))).toMatchObject({ beat: 1, slot: 0 })
  })

  it('carries on into the next bar rather than stopping at the line', () => {
    let state = start(2)
    for (let step = 0; step < 8; step += 1) state = moveRight(state)

    expect(at(state)).toMatchObject({ bar: 1, beat: 0, slot: 0 })
  })

  it('comes back into the last slot of the bar before', () => {
    let state = start(2)
    for (let step = 0; step < 8; step += 1) state = moveRight(state)

    expect(at(moveLeft(state))).toMatchObject({ bar: 0, beat: 3, slot: 1 })
  })

  it('stops at the very beginning and the very end', () => {
    expect(at(moveLeft(start()))).toEqual(AT_START)

    let state = start()
    for (let step = 0; step < 20; step += 1) state = moveRight(state)
    expect(at(moveRight(state))).toEqual(at(state))
  })

  it('goes up and down the strings', () => {
    expect(at(moveDown(start())).string).toBe(1)
    expect(at(moveUp(moveDown(start()))).string).toBe(0)
  })

  it('stays on the top string when there is nothing above', () => {
    expect(at(moveUp(start())).string).toBe(0)
  })

  /* Past the last string is the bar on the line below, which is what a text
     editor would do if it knew about bars. */
  it('drops to the line below from the bottom string', () => {
    const doc: TabDoc = { ...newTab(6), bars: [...newTab(6).bars, ...newTab(6).bars, ...newTab(6).bars] }
    const wrapAt = 40 /* narrow enough that three bars need two lines */
    let state: Editing = { doc, cursor: { bar: 0, beat: 0, slot: 0, string: 5 } }

    state = moveDown(state, wrapAt)

    expect(state.cursor.bar).toBeGreaterThan(0)
    expect(state.cursor.string).toBe(0)
  })
})

describe('tidying up when the cursor leaves', () => {
  it('leaves one spare bar to write into', () => {
    const state = settle({ doc: { ...newTab(6), bars: [...newTab(6).bars, ...newTab(6).bars] }, cursor: AT_START })

    expect(state.doc.bars).toHaveLength(1)
  })

  it('keeps the cursor somewhere that exists', () => {
    const many: TabDoc = { ...newTab(6), bars: [...newTab(6).bars, ...newTab(6).bars] }
    const state = settle({ doc: many, cursor: { bar: 1, beat: 3, slot: 1, string: 5 } })

    expect(state.doc.bars[state.cursor.bar]?.beats[state.cursor.beat]?.slots[state.cursor.slot]).toBeDefined()
  })

  it('adds a bar to write into once the last one is used', () => {
    const state = settle(typeFret(start(), '5', Infinity))

    expect(state.doc.bars).toHaveLength(2)
    expect(render(state.doc).split('\n\n').length).toBeGreaterThanOrEqual(1)
  })
})

/**
 * The editor works on the document and shows the text; this is the one place
 * the two have to agree. A cursor drawn in the wrong column is worse than no
 * cursor at all.
 */
describe('where the cursor is in the drawing', () => {
  const lines = (state: Editing) => render(state.doc).split('\n')

  it('sits on the character it is standing on', () => {
    const state = typeFret(start(), '7', Infinity)
    const place = placeOf(state.doc, state.cursor)

    expect(place).not.toBeNull()
    expect(lines(state)[place?.line ?? 0]?.[place?.column ?? 0]).toBe('7')
  })

  it('follows the cursor along the slots', () => {
    let state = moveRight(start())
    state = typeFret(state, '9', Infinity)
    const place = placeOf(state.doc, state.cursor)

    expect(lines(state)[place?.line ?? 0]?.[place?.column ?? 0]).toBe('9')
  })

  it('follows it down the strings', () => {
    let state = start()
    for (let step = 0; step < 4; step += 1) state = moveDown(state)
    state = typeFret(state, '5', Infinity)
    const place = placeOf(state.doc, state.cursor)

    expect(lines(state)[place?.line ?? 0]?.[place?.column ?? 0]).toBe('5')
  })

  /* Two-digit frets push everything after them right, and the cursor with it. */
  it('keeps up when a bar widens under it', () => {
    let state = typeFret(typeFret(start(), '1', Infinity), '2', 0)
    state = moveRight(moveRight(state))
    state = typeFret(state, '8', Infinity)
    const place = placeOf(state.doc, state.cursor)

    expect(lines(state)[place?.line ?? 0]?.[place?.column ?? 0]).toBe('8')
  })

  it('finds it in a bar on the second line', () => {
    const doc = { ...newTab(6), bars: [...newTab(6).bars, ...newTab(6).bars, ...newTab(6).bars] }
    const state: Editing = { doc, cursor: { bar: 2, beat: 0, slot: 0, string: 0 } }
    const place = placeOf(doc, state.cursor, 40)

    expect(place).not.toBeNull()
    expect((place?.line ?? 0)).toBeGreaterThan(6)
  })
})

/**
 * Up and down go up and down the screen. The bar on the line below may be a
 * different shape entirely — a different number of beats, or beats split into
 * sixteenths — and following the beat rather than the column would send the
 * cursor sideways, which is not what anybody pressing an arrow meant.
 */
describe('crossing between lines of bars', () => {
  /* Three bars, narrow enough that they do not all fit on one line. */
  const threeBars = (): TabDoc => ({
    ...newTab(6),
    bars: [...newTab(6).bars, ...newTab(6).bars, ...newTab(6).bars]
  })
  const wrapAt = 40

  it('drops from the bottom string to the line below', () => {
    const state: Editing = { doc: threeBars(), cursor: { bar: 0, beat: 0, slot: 0, string: 5 } }

    const moved = moveDown(state, wrapAt)

    expect(moved.cursor.string).toBe(0)
    expect(moved.cursor.bar).toBeGreaterThan(0)
  })

  it('comes back up to the bottom string of the line above', () => {
    const doc = threeBars()
    const down = moveDown({ doc, cursor: { bar: 0, beat: 0, slot: 0, string: 5 } }, wrapAt)

    const back = moveUp(down, wrapAt)

    expect(back.cursor.string).toBe(5)
    expect(back.cursor.bar).toBe(0)
  })

  /* Straight down: the column is what is kept, not the beat. */
  it('stays in the same column rather than the same beat', () => {
    const doc = threeBars()
    const from: Editing = { doc, cursor: { bar: 0, beat: 2, slot: 1, string: 5 } }
    const column = placeOf(doc, from.cursor, wrapAt)?.column

    const moved = moveDown(from, wrapAt)

    expect(placeOf(doc, moved.cursor, wrapAt)?.column).toBe(column)
  })

  it('stays put at the very bottom', () => {
    const doc = threeBars()
    const last = doc.bars.length - 1
    const state: Editing = { doc, cursor: { bar: last, beat: 0, slot: 0, string: 5 } }

    expect(moveDown(state, wrapAt).cursor).toEqual(state.cursor)
  })
})

/** What was clicked on, which is the same question as what is straight above. */
describe('pointing at a place in the drawing', () => {
  it('finds the slot under a column', () => {
    const doc = newTab(6)
    const wanted: Cursor = { bar: 0, beat: 2, slot: 1, string: 3 }
    const place = placeOf(doc, wanted)

    const found = cursorAtPlace(doc, place?.line ?? 0, place?.column ?? 0)

    expect(found).toEqual(wanted)
  })

  it('takes the nearest slot when the column falls between two', () => {
    const doc = newTab(6)
    const place = placeOf(doc, { bar: 0, beat: 1, slot: 0, string: 0 })

    const found = cursorAtPlace(doc, place?.line ?? 0, (place?.column ?? 0) + 1)

    expect(found).toMatchObject({ beat: 1, slot: 0 })
  })

  it('answers with something for a line off the end of the drawing', () => {
    expect(cursorAtPlace(newTab(6), 999, 4)).not.toBeNull()
  })
})

/**
 * A beat is the beat and its eighth; the two sixteenths between them are added
 * one at a time. The same gap can be opened from either side of it, which is
 * what the sketch means by saying the `a` can be made from the beat after it.
 */
describe('making room for a sixteenth', () => {
  const beatOf = (state: Editing) => state.doc.bars[0]?.beats[state.cursor.beat]
  const positions = (state: Editing) => beatOf(state)?.slots.map((slot) => slot.at)

  it('opens the e to the right of a beat', () => {
    const state = subdivide(start(), 1)

    expect(positions(state)).toEqual([0, 1, 2])
  })

  it('opens the a to the right of the eighth', () => {
    const state = subdivide(moveRight(start()), 1)

    expect(positions(state)).toEqual([0, 2, 3])
  })

  it('opens the e to the left of the eighth', () => {
    const state = subdivide(moveRight(start()), -1)

    expect(positions(state)).toEqual([0, 1, 2])
  })

  it('stands on the new one, ready to be typed into', () => {
    const state = subdivide(start(), 1)

    expect(beatOf(state)?.slots[state.cursor.slot]?.at).toBe(1)
    expect(fretAt(state.doc, state.cursor)).toBeNull()
  })

  /* To the left of a beat is the end of the beat before it. */
  it('opens the a of the beat before, from the beat after', () => {
    let state = start()
    for (let step = 0; step < 2; step += 1) state = moveRight(state)
    expect(state.cursor.beat).toBe(1)

    state = subdivide(state, -1)

    expect(state.cursor.beat).toBe(0)
    expect(state.doc.bars[0]?.beats[0]?.slots.map((slot) => slot.at)).toEqual([0, 2, 3])
  })

  it('does nothing at the very beginning, where there is nothing before', () => {
    expect(subdivide(start(), -1)).toEqual(start())
  })

  it('does not open one twice', () => {
    const once = subdivide(start(), 1)

    expect(positions(subdivide(once, 1))).toEqual([0, 1, 2])
  })
})

describe('emptying a sixteenth', () => {
  const opened = (): Editing => {
    const state = subdivide(start(), 1)
    return typeFret(state, '5', Infinity)
  }

  /* It stays open while the cursor is in the beat, so that what was just
     deleted can be typed again without the gap closing underneath. */
  it('leaves the gap while the cursor is still in the beat', () => {
    const state = settle(deleteNote(opened()))

    expect(state.doc.bars[0]?.beats[0]?.slots).toHaveLength(3)
  })

  it('closes it once the cursor has gone', () => {
    let state = settle(deleteNote(opened()))
    for (let step = 0; step < 3; step += 1) state = settle(moveRight(state))

    expect(state.doc.bars[0]?.beats[0]?.slots).toHaveLength(2)
  })

  it('keeps it when there is still something in it', () => {
    let state = opened()
    for (let step = 0; step < 3; step += 1) state = settle(moveRight(state))

    expect(state.doc.bars[0]?.beats[0]?.slots).toHaveLength(3)
  })
})

describe('how many beats a bar is in', () => {
  const beats = (state: Editing, bar = 0) => state.doc.bars[bar]?.beats.length

  it('grows and shrinks', () => {
    expect(beats(setBeats(start(), 6))).toBe(6)
    expect(beats(setBeats(start(), 3))).toBe(3)
  })

  it('will not go past three or twelve', () => {
    expect(beats(setBeats(start(), 1))).toBe(3)
    expect(beats(setBeats(start(), 99))).toBe(12)
  })

  /* Nothing written after it yet, so this is a decision about the piece rather
     than about one bar. */
  it('carries on into the empty bars after it', () => {
    const state = setBeats(settle(typeFret(start(), '7', Infinity)), 6)

    expect(beats(state, 0)).toBe(6)
    expect(beats(state, 1)).toBe(6)
  })

  it('leaves music that is already written in the shape it was written in', () => {
    let state = settle(typeFret(start(), '7', Infinity))
    /* Write something in the second bar too. */
    state = { doc: state.doc, cursor: { bar: 1, beat: 0, slot: 0, string: 0 } }
    state = settle(typeFret(state, '9', Infinity))
    state = { doc: state.doc, cursor: { bar: 0, beat: 0, slot: 0, string: 0 } }

    state = setBeats(state, 7)

    expect(beats(state, 0)).toBe(7)
    expect(beats(state, 1)).toBe(4)
  })

  it('keeps the cursor inside the bar when it shrinks', () => {
    let state = setBeats(start(), 12)
    state = { ...state, cursor: { bar: 0, beat: 11, slot: 1, string: 0 } }

    state = setBeats(state, 3)

    expect(state.cursor.beat).toBeLessThan(3)
    expect(state.doc.bars[0]?.beats[state.cursor.beat]?.slots[state.cursor.slot]).toBeDefined()
  })
})

/**
 * A slide is not a note; it is what happens between two of them, so it lives
 * in the join rather than on either side.
 */
describe('joining two notes', () => {
  const joinAt = (state: Editing) =>
    state.doc.bars[0]?.beats[state.cursor.beat]?.slots[state.cursor.slot]?.after[state.cursor.string]

  it('writes a slide after the note under the cursor', () => {
    expect(joinAt(joinWith(typeFret(start(), '4', Infinity), '/'))).toBe('/')
  })

  it('takes it off again when it is typed twice', () => {
    const once = joinWith(start(), '/')

    expect(joinAt(joinWith(once, '/'))).toBe('-')
  })

  it('replaces one with another', () => {
    const slide = joinWith(start(), '/')

    expect(joinAt(joinWith(slide, '^'))).toBe('^')
  })

  it('belongs to one string, not to the moment', () => {
    const state = joinWith(start(), '/')

    expect(state.doc.bars[0]?.beats[0]?.slots[0]?.after[1]).toBe('-')
  })

  /* The sketch shows a slide into a note with nothing before it, which its own
     prose forbids. The join carries it, so an empty slot can carry one too. */
  it('can be written with no note before it', () => {
    const state = joinWith(start(), '/')

    expect(fretAt(state.doc, state.cursor)).toBeNull()
    expect(joinAt(state)).toBe('/')
  })
})

describe('naming a chord', () => {
  it('writes it above the beat the cursor is in', () => {
    const state = nameChord(moveRight(moveRight(start())), 'Am')

    expect(state.doc.bars[0]?.beats[1]?.chord).toBe('Am')
  })

  it('reads back what is there', () => {
    const state = nameChord(start(), 'Dm7')

    expect(chordAt(state.doc, state.cursor)).toBe('Dm7')
  })

  it('rubs it out when it is emptied', () => {
    const named = nameChord(start(), 'Am')

    expect(nameChord(named, '   ').doc.bars[0]?.beats[0]?.chord).toBeNull()
  })

  /* Above the beat, not at a column: widening the bar takes it along. */
  it('stays over its beat when the bar widens', () => {
    let state = nameChord(moveRight(moveRight(start())), 'E')
    state = typeFret(state, '1', Infinity)
    state = typeFret(state, '2', 0)

    expect(state.doc.bars[0]?.beats[1]?.chord).toBe('E')
  })
})
