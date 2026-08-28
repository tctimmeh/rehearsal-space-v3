import { useEffect, useMemo, useRef, useState } from 'react'

import { AT_START, deleteNote, moveDown, moveLeft, moveRight, moveUp, settle, typeFret, typeMute, type Editing } from '@core/tab/edit'
import { placeOf, render, WRAP_COLUMNS } from '@core/tab/render'
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
  /* When the last digit was typed, so that two in quick succession make one
     number. Reset by moving, because a digit typed elsewhere is not this one. */
  const typedAt = useRef(0)
  const field = useRef<HTMLDivElement>(null)
  const block = useRef<HTMLSpanElement>(null)

  const tab = song?.tabs.find((entry) => entry.id === tabId) ?? song?.tabs[0] ?? null

  useEffect(() => {
    if (song === null || tab === null) return
    if (tabId !== tab.id) void openTab(song.id, tab)
  }, [song?.id, tab?.id])

  /* A document swapped underneath — a different file, or one just read — has
     no reason to keep a cursor that pointed into the old one. */
  useEffect(() => setCursor(AT_START), [revision])

  /* Opening the tool is asking to write in it, and there is nothing else here
     to click on first. */
  useEffect(() => field.current?.focus(), [tabId])

  /* Remeasure whenever there is more or less room, so bars fill the width. */
  useEffect(() => {
    const sheet = field.current
    if (sheet === null) return
    const measure = (): void => {
      const fits = charactersAcross(sheet)
      if (fits !== null) setColumns(fits)
    }
    measure()
    const watching = new ResizeObserver(measure)
    watching.observe(sheet)
    return () => watching.disconnect()
  }, [])

  /* Somewhere off the bottom of a long tab is no use to whoever is typing. */
  useEffect(() => {
    block.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [cursor, columns])

  const text = useMemo(() => render(doc, columns), [doc, columns])
  const lines = useMemo(() => text.split('\n'), [text])
  const place = placeOf(doc, cursor, columns)

  if (song === null) return <p className="tool-placeholder">No song loaded.</p>
  if (tab === null) return <NoTabYet />

  const apply = (next: Editing, moved: boolean): void => {
    if (moved) typedAt.current = 0
    const tidied = moved ? settle(next) : next
    setCursor(tidied.cursor)
    if (tidied.doc !== doc) edit(tidied.doc)
  }

  const moves: Record<string, (state: Editing) => Editing> = {
    ArrowLeft: moveLeft,
    ArrowRight: moveRight,
    ArrowUp: moveUp,
    ArrowDown: moveDown
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const state: Editing = { doc, cursor }

    const move = moves[event.key]
    if (move !== undefined) {
      apply(move(state), true)
      event.preventDefault()
      return
    }

    if (/^\d$/.test(event.key)) {
      /* Nothing typed yet at this spot, so nothing for a second digit to join. */
      const since = typedAt.current === 0 ? Infinity : Date.now() - typedAt.current
      apply(typeFret(state, event.key, since), false)
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
      >
        {lines.map((line, index) => (
          <div className="tablature__line" key={index}>
            {place !== null && place.line === index ? (
              <>
                {line.slice(0, place.column)}
                <span className="tablature__cursor" ref={block}>
                  {line[place.column] ?? ' '}
                </span>
                {line.slice(place.column + 1)}
              </>
            ) : (
              line || ' '
            )}
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
function charactersAcross(sheet: HTMLElement): number | null {
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
  return Math.max(MIN_COLUMNS, Math.floor(across / each))
}

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
