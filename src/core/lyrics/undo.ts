export interface Snapshot {
  text: string
  /** Where the caret was, so undo puts it back where the work was happening. */
  caret: number
}

export interface History {
  past: Snapshot[]
  present: Snapshot
  future: Snapshot[]
}

export type EditKind = 'insert' | 'delete' | 'replace' | 'none'

export interface Edit {
  kind: EditKind
  /** Where the change begins in both texts. */
  at: number
  inserted: string
  removed: string
}

/** Long enough to finish a word, short enough that a thought is one step. */
export const PAUSE_MS = 700
/** No step swallows more than this, however fast the typing. */
const LONGEST_STEP = 120
/** Far enough back to cover an evening's writing. */
const DEPTH = 300

/**
 * What changed between two versions of the text.
 *
 * Worked out by comparing the ends, which is enough for the edits a text area
 * produces: everything before the first difference and after the last one is
 * untouched, and what lies between was replaced.
 */
export function describeEdit(before: string, after: string): Edit {
  if (before === after) return { kind: 'none', at: 0, inserted: '', removed: '' }

  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1
  }

  let fromEnd = 0
  while (
    fromEnd < before.length - start &&
    fromEnd < after.length - start &&
    before[before.length - 1 - fromEnd] === after[after.length - 1 - fromEnd]
  ) {
    fromEnd += 1
  }

  const removed = before.slice(start, before.length - fromEnd)
  const inserted = after.slice(start, after.length - fromEnd)
  const kind = removed === '' ? 'insert' : inserted === '' ? 'delete' : 'replace'
  return { kind, at: start, inserted, removed }
}

export const beginHistory = (snapshot: Snapshot): History => ({
  past: [],
  present: snapshot,
  future: []
})

const isSpace = (text: string): boolean => /\s/.test(text)

/**
 * Whether an edit starts a new undo step or joins the one being written.
 *
 * A text editor does not undo letter by letter, and it does not throw away
 * everything since the file was opened either. It breaks where the writing
 * breaks: at the end of a word, when the hand changes from writing to
 * deleting, when a thought is paused over, and when the caret is moved
 * somewhere else entirely.
 */
export function startsNewStep(
  previous: Edit,
  edit: Edit,
  sinceMs: number,
  stepLength = 0
): boolean {
  if (previous.kind === 'none') return true
  if (sinceMs >= PAUSE_MS) return true
  if (edit.kind !== previous.kind) return true
  if (edit.kind === 'replace') return true
  if (stepLength >= LONGEST_STEP) return true

  /* A word and the space after it are one step, so undoing takes back a word
     at a time rather than leaving the space behind as a press of its own. */
  if (edit.kind === 'insert' && !isSpace(edit.inserted) && isSpace(previous.inserted)) return true

  /* Typing somewhere else is a different piece of work. Deleting walks
     backwards, which is not the caret moving away. */
  const carriesOn =
    edit.kind === 'delete'
      ? edit.at === previous.at - edit.removed.length || edit.at === previous.at
      : edit.at === previous.at + previous.inserted.length
  return !carriesOn
}

export interface Recording {
  history: History
  /** The edit the step being written is made of, for the next one to judge. */
  edit: Edit
  /** How long that step has grown, so nothing swallows a whole verse. */
  length: number
}

/**
 * Adds an edit to the history, either as a new step or merged into the last.
 *
 * Merging means replacing what the present is, not stacking another entry:
 * a step is the state to come back to, and the state to come back to while a
 * word is being typed is the one before the word.
 */
export function record(
  recording: Recording,
  next: Snapshot,
  sinceMs: number
): Recording {
  const edit = describeEdit(recording.history.present.text, next.text)
  if (edit.kind === 'none') return recording

  const fresh = startsNewStep(recording.edit, edit, sinceMs, recording.length)
  const { past, present } = recording.history

  return {
    history: {
      past: fresh ? [...past, present].slice(-DEPTH) : past,
      present: next,
      future: []
    },
    edit,
    length: fresh ? edit.inserted.length + edit.removed.length : recording.length + 1
  }
}

export const canUndo = (history: History): boolean => history.past.length > 0
export const canRedo = (history: History): boolean => history.future.length > 0

export function undo(history: History): History {
  const previous = history.past.at(-1)
  if (previous === undefined) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future]
  }
}

export function redo(history: History): History {
  const next = history.future[0]
  if (next === undefined) return history
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1)
  }
}
