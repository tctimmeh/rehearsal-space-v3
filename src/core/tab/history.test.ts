import { describe, expect, it } from 'vitest'

import { newTab } from './document'
import { AT_START, typeFret, type Editing } from './edit'
import { begin, canRedo, canUndo, redo, remember, undo, type History } from './history'

const start: Editing = { doc: newTab(6), cursor: AT_START }
const fretAt = (history: History): string | null =>
  history.present.doc.bars[0]?.beats[0]?.slots[0]?.frets[0] ?? null

const typed = (state: Editing, digit: string, sinceMs = Infinity): Editing =>
  typeFret(state, digit, sinceMs)

describe('going back', () => {
  it('has nowhere to go at the start', () => {
    expect(canUndo(begin(start))).toBe(false)
    expect(canRedo(begin(start))).toBe(false)
  })

  it('takes back the last edit', () => {
    const one = typed(start, '7')
    const history = remember(begin(start), one)

    expect(fretAt(undo(history))).toBeNull()
  })

  it('puts it back again', () => {
    const history = remember(begin(start), typed(start, '7'))

    expect(fretAt(redo(undo(history)))).toBe('7')
  })

  it('brings the cursor back with the notes', () => {
    const moved: Editing = { doc: start.doc, cursor: { bar: 0, beat: 2, slot: 1, string: 3 } }
    const history = remember(begin(start), moved)

    expect(undo(history).present.cursor).toEqual(AT_START)
  })

  /* Typing 12 is one act, and undoing it should not leave a 1 behind. */
  it('takes back both digits of a fret at once', () => {
    const one = typed(start, '1')
    const two = typed(one, '2', 100)
    const history = remember(remember(begin(start), one), two, true)

    expect(fretAt(history)).toBe('12')
    expect(fretAt(undo(history))).toBeNull()
  })

  it('forgets what was undone once something else is done', () => {
    const history = remember(begin(start), typed(start, '7'))
    const back = undo(history)

    const elsewhere = remember(back, typed(back.present, '9'))

    expect(canRedo(elsewhere)).toBe(false)
  })

  it('stops holding on after a while', () => {
    let history = begin(start)
    for (let step = 0; step < 500; step += 1) {
      history = remember(history, typed(history.present, '5'))
    }

    expect(history.past.length).toBeLessThanOrEqual(200)
  })
})
