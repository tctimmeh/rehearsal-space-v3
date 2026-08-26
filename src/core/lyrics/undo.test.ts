import { describe, expect, it } from 'vitest'

import {
  beginHistory,
  canRedo,
  canUndo,
  describeEdit,
  PAUSE_MS,
  record,
  redo,
  undo,
  type Recording
} from './undo'

const empty = (): Recording => ({
  history: beginHistory({ text: '', caret: 0 }),
  edit: { kind: 'none', at: 0, inserted: '', removed: '' },
  length: 0
})

/** Types a string one character at a time, as fast as a person can. */
const typing = (text: string, from = empty(), firstGap = 40): Recording => {
  let recording = from
  let sofar = recording.history.present.text
  let gap = firstGap
  for (const character of text) {
    sofar += character
    recording = record(recording, { text: sofar, caret: sofar.length }, gap)
    gap = 40
  }
  return recording
}

const backspacing = (times: number, from: Recording, gap = 40): Recording => {
  let recording = from
  for (let n = 0; n < times; n += 1) {
    const text = recording.history.present.text.slice(0, -1)
    recording = record(recording, { text, caret: text.length }, gap)
  }
  return recording
}

const rewind = (recording: Recording, presses: number): string[] => {
  let history = recording.history
  const seen: string[] = []
  for (let press = 0; press < presses; press += 1) {
    history = undo(history)
    seen.push(history.present.text)
  }
  return seen
}

describe('describeEdit', () => {
  it('sees a character typed', () => {
    expect(describeEdit('one', 'ones')).toEqual({
      kind: 'insert',
      at: 3,
      inserted: 's',
      removed: ''
    })
  })

  it('sees a character deleted', () => {
    expect(describeEdit('ones', 'one')).toEqual({
      kind: 'delete',
      at: 3,
      inserted: '',
      removed: 's'
    })
  })

  it('sees an insertion in the middle', () => {
    const edit = describeEdit('one three', 'one two three')
    expect(edit.kind).toBe('insert')
    expect(edit.inserted).toHaveLength(4)
  })

  it('sees a wholesale rewrite as one', () => {
    const edit = describeEdit('C  Am', 'D  Bm')
    expect(edit.kind).toBe('replace')
  })

  it('has nothing to say when nothing changed', () => {
    expect(describeEdit('same', 'same').kind).toBe('none')
  })
})

/**
 * The point of all this: a text editor does not undo letter by letter.
 */
describe('what makes a step', () => {
  it('undoes a word at a time, not a letter at a time', () => {
    const written = typing('one two three four')

    /* A word and the space after it come back together. */
    expect(rewind(written, 4)).toEqual(['one two three ', 'one two ', 'one ', ''])
  })

  it('keeps the space with the word it belongs to', () => {
    const written = typing('hold on')
    expect(rewind(written, 1)).toEqual(['hold '])
  })

  it('breaks where the writing was paused over', () => {
    const started = typing('holding')
    const afterThinking = typing('steady', started, PAUSE_MS + 1)

    expect(rewind(afterThinking, 1)).toEqual(['holding'])
  })

  it('does not break for the ordinary rhythm of typing', () => {
    const written = typing('steady', empty(), 30)
    expect(written.history.past).toHaveLength(1)
  })

  it('separates deleting from writing', () => {
    const written = backspacing(3, typing('mistake'))

    /* One undo puts back what was deleted; the next takes away the word. */
    expect(rewind(written, 2)).toEqual(['mistake', ''])
  })

  it('groups a run of backspaces into one step', () => {
    const written = backspacing(4, typing('overthrown'))
    expect(rewind(written, 1)).toEqual(['overthrown'])
  })

  it('breaks when the caret is moved somewhere else', () => {
    const written = typing('the coast road')
    const elsewhere = record(
      written,
      { text: `A ${written.history.present.text}`, caret: 2 },
      40
    )

    expect(rewind(elsewhere, 1)).toEqual(['the coast road'])
  })

  it('never swallows more than a couple of lines at once', () => {
    const written = typing('a'.repeat(400), empty(), 5)
    expect(written.history.past.length).toBeGreaterThan(2)
  })

  it('treats a rewrite as a step of its own', () => {
    const written = typing('C       Am')
    const transposed = record(written, { text: 'D       Bm', caret: 10 }, 20)

    expect(rewind(transposed, 1)).toEqual(['C       Am'])
  })
})

describe('going back and forward', () => {
  it('says whether there is anywhere to go', () => {
    const nothing = empty()
    expect(canUndo(nothing.history)).toBe(false)
    expect(canRedo(nothing.history)).toBe(false)

    const written = typing('one two')
    expect(canUndo(written.history)).toBe(true)
  })

  it('puts back what undo took away', () => {
    const written = typing('one two')
    const back = undo(written.history)

    expect(redo(back).present.text).toBe('one two')
  })

  it('puts the caret back where the work was', () => {
    const written = typing('one two')
    expect(undo(written.history).present.caret).toBe('one '.length)
  })

  it('forgets the future once something else is written', () => {
    const written = typing('one two')
    const back = undo(written.history)
    const elsewhere = record(
      { history: back, edit: { kind: 'none', at: 0, inserted: '', removed: '' }, length: 0 },
      { text: `${back.present.text} three`, caret: 9 },
      40
    )

    expect(canRedo(elsewhere.history)).toBe(false)
  })

  it('does nothing at the ends rather than falling off them', () => {
    const nothing = empty()
    expect(undo(nothing.history)).toBe(nothing.history)
    expect(redo(nothing.history)).toBe(nothing.history)
  })
})
