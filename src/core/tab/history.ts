import type { Cursor, TabDoc } from './document'

/**
 * Going back.
 *
 * The lyrics editor keeps its own history because colouring the text breaks
 * the browser's, and its rules are about prose — word endings, pauses in
 * typing, a cap on how long one step may get. None of that means anything
 * here. An edit to tablature is already a discrete act: a fret, a rest, a
 * subdivision, a bar's worth of beats. So every edit is a step, with one
 * exception — the second digit of a two-digit fret joins the first, because
 * typing 12 is one act and undoing it should not leave a 1 behind.
 */
export interface Step {
  doc: TabDoc
  cursor: Cursor
}

export interface History {
  past: Step[]
  present: Step
  future: Step[]
}

/** Deep enough for a session's work, shallow enough not to hold a whole song. */
export const DEPTH = 200

export const begin = (present: Step): History => ({ past: [], present, future: [] })

/**
 * Records an edit.
 *
 * `joins` folds this into the step before it rather than adding one, which is
 * how the two digits of a fret come to be undone together.
 */
export function remember(history: History, present: Step, joins = false): History {
  if (joins) return { ...history, present, future: [] }
  return {
    past: [...history.past, history.present].slice(-DEPTH),
    present,
    future: []
  }
}

export const canUndo = (history: History): boolean => history.past.length > 0
export const canRedo = (history: History): boolean => history.future.length > 0

export function undo(history: History): History {
  const previous = history.past[history.past.length - 1]
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
