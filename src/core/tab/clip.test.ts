import { describe, expect, it } from 'vitest'

import { newTab, type TabDoc } from './document'
import { AT_START, subdivide, typeFret, type Editing } from './edit'
import { asDocument, beatAtIndex, beatIndexOf, clearBeats, copyBeats, pasteBeats, totalBeats } from './clip'
import { render } from './render'

/** A bar with a fret on the first string of every beat, so beats are telling apart. */
const written = (): TabDoc => {
  let state: Editing = { doc: newTab(6), cursor: AT_START }
  for (const [beat, fret] of ['3', '5', '7', '9'].entries()) {
    state = typeFret({ ...state, cursor: { bar: 0, beat, slot: 0, string: 0 } }, fret, Infinity)
  }
  return state.doc
}

const fretsOf = (doc: TabDoc, bar = 0) =>
  doc.bars[bar]?.beats.map((beat) => beat.slots[0]?.frets[0] ?? null)

describe('counting beats through a document', () => {
  it('runs on across bar lines', () => {
    const doc: TabDoc = { ...newTab(6), bars: [...newTab(6).bars, ...newTab(6).bars] }

    expect(totalBeats(doc)).toBe(8)
    expect(beatIndexOf(doc, { bar: 1, beat: 2, slot: 0, string: 0 })).toBe(6)
    expect(beatAtIndex(doc, 6)).toEqual({ bar: 1, beat: 2 })
  })

  it('answers with nothing past the end', () => {
    expect(beatAtIndex(newTab(6), 99)).toBeNull()
  })
})

describe('copying a stretch', () => {
  it('takes the beats between the ends, both included', () => {
    const taken = copyBeats(written(), { from: 1, to: 2 })

    expect(taken).toHaveLength(2)
    expect(taken[0]?.slots[0]?.frets[0]).toBe('5')
    expect(taken[1]?.slots[0]?.frets[0]).toBe('7')
  })

  it('does not mind which end was picked first', () => {
    expect(copyBeats(written(), { from: 2, to: 1 })).toEqual(copyBeats(written(), { from: 1, to: 2 }))
  })

  /* Editing what was copied must not reach back into what it came from. */
  it('takes a copy rather than a view', () => {
    const doc = written()
    const taken = copyBeats(doc, { from: 0, to: 0 })
    const slot = taken[0]?.slots[0]
    if (slot) slot.frets[0] = '99'

    expect(fretsOf(doc)?.[0]).toBe('3')
  })
})

describe('clearing a stretch', () => {
  it('empties the notes it covers and leaves the rest', () => {
    expect(fretsOf(clearBeats(written(), { from: 1, to: 2 }))).toEqual(['3', null, null, '9'])
  })

  /* The notes go; the rhythm they were played in stays. */
  it('keeps the beats in the shape they were written', () => {
    let state: Editing = { doc: written(), cursor: { bar: 0, beat: 1, slot: 0, string: 0 } }
    state = subdivide(state, 1)

    const cleared = clearBeats(state.doc, { from: 1, to: 1 })

    expect(cleared.bars[0]?.beats[1]?.slots).toHaveLength(3)
  })
})

describe('pasting a stretch back', () => {
  it('writes over what is there', () => {
    const doc = written()
    const taken = copyBeats(doc, { from: 0, to: 1 })

    const pasted = pasteBeats(doc, { bar: 0, beat: 2, slot: 0, string: 0 }, taken)

    expect(fretsOf(pasted)).toEqual(['3', '5', '3', '5'])
  })

  /* A beat in sixteenths brings its sixteenths with it. */
  it('brings the rhythm it was copied in', () => {
    let state: Editing = { doc: written(), cursor: { bar: 0, beat: 0, slot: 0, string: 0 } }
    state = subdivide(state, 1)
    const taken = copyBeats(state.doc, { from: 0, to: 0 })

    const pasted = pasteBeats(state.doc, { bar: 0, beat: 3, slot: 0, string: 0 }, taken)

    expect(pasted.bars[0]?.beats[3]?.slots).toHaveLength(3)
  })

  it('adds bars rather than dropping what will not fit', () => {
    const doc = written()
    const taken = copyBeats(doc, { from: 0, to: 3 })

    const pasted = pasteBeats(doc, { bar: 0, beat: 2, slot: 0, string: 0 }, taken)

    expect(pasted.bars.length).toBeGreaterThan(1)
    expect(fretsOf(pasted, 1)?.slice(0, 2)).toEqual(['7', '9'])
  })

  it('does nothing with nothing to paste', () => {
    const doc = written()
    expect(pasteBeats(doc, AT_START, [])).toBe(doc)
  })
})

describe('what goes on the clipboard', () => {
  it('draws the copied beats as tablature anybody could read', () => {
    const taken = copyBeats(written(), { from: 0, to: 1 })

    const text = render(asDocument(taken, 6))

    expect(text).toContain('|-3-')
    expect(text.split('\n').filter((line) => line.startsWith('|'))).toHaveLength(6)
  })
})
