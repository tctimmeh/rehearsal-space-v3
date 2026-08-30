import { useEffect, useMemo, useRef, useState } from 'react'

import {
  AT_START,
  deleteNote,
  moveDown,
  moveLeft,
  moveRight,
  moveUp,
  QUICK_MS,
  setBeats,
  settle,
  subdivide,
  typeFret,
  typeMute,
  type Editing
} from '@core/tab/edit'
import {
  begin as beginHistory,
  canRedo,
  canUndo,
  redo,
  remember,
  undo,
  type History
} from '@core/tab/history'
import { cursorAtPlace, placeOf, render, WRAP_COLUMNS } from '@core/tab/render'
import type { TabFile } from '@core/song/song'
import { useSong } from '@renderer/state/song'
import { useTabs } from '@renderer/state/tabs'
import { Button } from '../primitives'

/**
 * Writing tablature.
 *
 * The music is a document; this draws it and moves a block cursor over it.
 * There is no text field underneath — a caret between characters is the wrong
 * idea entirely, since what is being pointed at is a moment on a string, not a
 * position in a line.
 *
 * Which means every key has to be caught here, and the app's own keys — space
 * to play, L to loop — must not fire while somebody is typing frets. The
 * marker on the focusable element is what tells them not to.
 */
export function TabEditor() {
  const song = useSong((state) => state.song)
  const doc = useTabs((state) => state.doc)
  const revision = useTabs((state) => state.revision)
  const openTab = useTabs((state) => state.open)
  const tabId = useTabs((state) => state.tabId)
  const edit = useTabs((state) => state.edit)
  const saved = useTabs((state) => state.saved)
  const error = useTabs((state) => state.error)

  const [cursor, setCursor] = useState(AT_START)
  /**
   * How many characters fit across, which is how many bars go on a line.
   *
   * The file is written at a fixed width so that resizing the window never
   * rewrites it, but there is no reason for the screen to be held to that —
   * a wide window should show wide lines.
   */
  const [columns, setColumns] = useState(WRAP_COLUMNS)
  /** How wide one character is, for turning a click into a column. */
  const [each, setEach] = useState(0)
  /* When the last digit was typed, so that two in quick succession make one
     number. Reset by moving, because a digit typed elsewhere is not this one. */
  const typedAt = useRef(0)
  /* Every edit is a step of its own, except the second digit of a fret, which
     joins the first — typing 12 is one act. */
  const history = useRef<History>(beginHistory({ doc, cursor }))
  const field = useRef<HTMLDivElement>(null)
  const showing = useRef<HTMLDivElement>(null)

  const tab = song?.tabs.find((entry) => entry.id === tabId) ?? song?.tabs[0] ?? null

  useEffect(() => {
    if (song === null || tab === null) return
    if (tabId !== tab.id) void openTab(song.id, tab)
  }, [song?.id, tab?.id])

  /* A document swapped underneath — a different file, or one just read — has
     no reason to keep a cursor that pointed into the old one, nor a history of
     edits to a document that is no longer here. */
  useEffect(() => {
    setCursor(AT_START)
    history.current = beginHistory({ doc: useTabs.getState().doc, cursor: AT_START })
  }, [revision])

  /* Opening the tool is asking to write in it, and there is nothing else here
     to click on first. */
  useEffect(() => field.current?.focus(), [tabId])

  /* Remeasure whenever there is more or less room, so bars fill the width. */
  useEffect(() => {
    const sheet = field.current
    if (sheet === null) return
    const measure = (): void => {
      const fits = charactersAcross(sheet)
      if (fits === null) return
      setColumns(fits.columns)
      setEach(fits.each)
    }
    measure()
    const watching = new ResizeObserver(measure)
    watching.observe(sheet)
    return () => watching.disconnect()
  }, [])

  /*
   * The whole system is brought into view rather than the cursor alone.
   * Showing the character by itself leaves the beats it is counted against off
   * the top of the screen, and the rest of the bar off the bottom, which is
   * most of what there is to read.
   */
  useEffect(() => {
    showing.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [cursor, columns])

  const text = useMemo(() => render(doc, columns), [doc, columns])
  /* Drawn a system at a time, so that scrolling can think in whole bars. */
  const systems = useMemo(
    () => text.replace(/\n$/, '').split('\n\n').map((block) => block.split('\n')),
    [text]
  )
  const place = placeOf(doc, cursor, columns)

  if (song === null) return <p className="tool-placeholder">No song loaded.</p>
  if (tab === null) return <NoTabYet />

  /*
   * Clicking puts the cursor on the nearest slot to wherever the pointer
   * landed — nearest in both directions, because a click lands where it lands.
   * Aiming between two systems, or past the end of the last one, should still
   * mean something rather than nothing at all.
   */
  const onPointerDown = (event: React.PointerEvent): void => {
    field.current?.focus()
    const sheet = field.current
    if (sheet === null || each <= 0) return

    const row = nearestRow(sheet, event.clientY)
    if (row === null) return

    const box = row.getBoundingClientRect()
    const line = Number(row.getAttribute('data-line'))
    const column = Math.max(0, Math.round((event.clientX - box.left) / each))
    const found = cursorAtPlace(doc, line, column, columns)
    if (found !== null) {
      typedAt.current = 0
      setCursor(found)
    }
  }

  const apply = (next: Editing, moved: boolean, joins = false): void => {
    if (moved) typedAt.current = 0
    const tidied = moved ? settle(next) : next
    setCursor(tidied.cursor)
    if (tidied.doc === doc) {
      /* Only the cursor moved, so there is nothing to take back — but where it
         is now is where an undo should return to. */
      history.current = { ...history.current, present: tidied }
      return
    }
    history.current = remember(history.current, tidied, joins)
    edit(tidied.doc)
  }

  /** An edit made by a key that also has to stop the browser doing its own thing. */
  const step = (event: React.KeyboardEvent, next: Editing): void => {
    apply(next, false)
    event.preventDefault()
  }

  /** Steps back or forward, putting the document and the cursor back together. */
  const goTo = (history_: History): void => {
    history.current = history_
    typedAt.current = 0
    setCursor(history_.present.cursor)
    if (history_.present.doc !== doc) edit(history_.present.doc)
  }

  const moves: Record<string, (state: Editing, wrapAt: number) => Editing> = {
    ArrowLeft: moveLeft,
    ArrowRight: moveRight,
    ArrowUp: moveUp,
    ArrowDown: moveDown
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const held = event.ctrlKey || event.metaKey

    if (held && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      if (canUndo(history.current)) goTo(undo(history.current))
      event.preventDefault()
      return
    }
    if (held && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
      if (canRedo(history.current)) goTo(redo(history.current))
      event.preventDefault()
      return
    }

    const state: Editing = { doc, cursor }

    /* Shift makes room for a sixteenth beside the cursor. */
    if (event.shiftKey && !held && !event.altKey) {
      if (event.key === 'ArrowRight') return void step(event, subdivide(state, 1))
      if (event.key === 'ArrowLeft') return void step(event, subdivide(state, -1))
    }

    /* Control changes how many beats the bar is in. */
    if (held && !event.shiftKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      const beats = doc.bars[cursor.bar]?.beats.length ?? 4
      return void step(event, setBeats(state, beats + (event.key === 'ArrowRight' ? 1 : -1)))
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return

    const move = moves[event.key]
    if (move !== undefined) {
      apply(move(state, columns), true)
      event.preventDefault()
      return
    }

    if (/^\d$/.test(event.key)) {
      /* Nothing typed yet at this spot, so nothing for a second digit to join. */
      const since = typedAt.current === 0 ? Infinity : Date.now() - typedAt.current
      apply(typeFret(state, event.key, since), false, since <= QUICK_MS)
      typedAt.current = Date.now()
      event.preventDefault()
      return
    }

    if (event.key === 'x' || event.key === 'X') {
      apply(typeMute(state), false)
      event.preventDefault()
      return
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      apply(deleteNote(state), false)
      event.preventDefault()
    }
  }

  return (
    <div className="tablature">
      <div className="tablature__controls">
        <span className="tablature__name">{tab.name}</span>
        <span className="setting-note">{error ?? (saved ? 'Saved' : 'Saving…')}</span>
      </div>

      <div
        className="well tablature__sheet"
        ref={field}
        tabIndex={0}
        role="textbox"
        aria-label={`Tablature: ${tab.name}`}
        aria-multiline="true"
        /* Tells the app's own keys to keep out while this has the cursor. */
        data-typing="true"
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
      >
        {systems.map((block, system) => (
          <div
            className="tablature__system"
            key={system}
            ref={place?.system === system ? showing : undefined}
          >
            {block.map((line, offset) => {
              const index = lineOf(systems, system, offset)
              return (
                <div className="tablature__line" key={offset} data-line={index}>
                  {place !== null && place.line === index ? (
                    <>
                      {line.slice(0, place.column)}
                      <span className="tablature__cursor">{line[place.column] ?? ' '}</span>
                      {line.slice(place.column + 1)}
                    </>
                  ) : (
                    line || ' '
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * How many characters fit across the sheet.
 *
 * Measured rather than assumed, because the answer depends on the font the
 * window actually got. Null when there is nothing to measure — a window not
 * laid out yet, or a test — and the caller keeps what it had.
 */
function charactersAcross(sheet: HTMLElement): { columns: number; each: number } | null {
  const probe = document.createElement('div')
  probe.style.cssText = 'visibility:hidden;height:0;overflow:hidden'
  const sample = document.createElement('span')
  sample.style.whiteSpace = 'pre'
  sample.textContent = '0'.repeat(100)
  probe.append(sample)
  sheet.append(probe)

  const across = probe.getBoundingClientRect().width
  const each = sample.getBoundingClientRect().width / 100
  probe.remove()

  if (across <= 0 || each <= 0) return null
  return { columns: Math.max(MIN_COLUMNS, Math.floor(across / each)), each }
}

/**
 * The line of tablature nearest a point, whether or not it was hit squarely.
 *
 * There is a gap between systems and empty room below the last one, and a
 * click landing in either should still put the cursor somewhere.
 */
function nearestRow(sheet: HTMLElement, y: number): HTMLElement | null {
  let best: HTMLElement | null = null
  let closest = Infinity
  for (const row of sheet.querySelectorAll<HTMLElement>('.tablature__line')) {
    const box = row.getBoundingClientRect()
    const away = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0
    if (away < closest) {
      closest = away
      best = row
    }
    if (away === 0) break
  }
  return best
}

/** Which line of the whole drawing a system's nth line is. */
const lineOf = (systems: string[][], system: number, offset: number): number =>
  systems.slice(0, system).reduce((total, block) => total + block.length + 1, 0) + offset

/** Narrow enough to be unhelpful, but a bar has to go somewhere. */
const MIN_COLUMNS = 24

/** A song with no tablature yet, and the one button that changes that. */
function NoTabYet() {
  const song = useSong((state) => state.song)
  const update = useSong((state) => state.update)

  const start = (): void => {
    if (song === null) return
    const tab: TabFile = { id: 'tab', file: 'tabs/tab.txt', name: 'Tab', strings: 6 }
    void update({ tabs: [tab] })
  }

  return (
    <div className="stage-empty">
      <div>
        Nothing written yet.
        <div className="stage-empty__actions">
          <Button variant="primary" onClick={start}>
            Start a tab
          </Button>
        </div>
      </div>
    </div>
  )
}
