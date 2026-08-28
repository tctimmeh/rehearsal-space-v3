import { useEffect, useMemo, useRef, useState } from 'react'

import { AT_START, deleteNote, moveDown, moveLeft, moveRight, moveUp, settle, typeFret, typeMute, type Editing } from '@core/tab/edit'
import { placeOf, render } from '@core/tab/render'
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
  /* When the last digit was typed, so that two in quick succession make one
     number. Reset by moving, because a digit typed elsewhere is not this one. */
  const typedAt = useRef(0)
  const field = useRef<HTMLDivElement>(null)

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

  const text = useMemo(() => render(doc), [doc])
  const lines = useMemo(() => text.split('\n'), [text])
  const place = placeOf(doc, cursor)

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
    <div className="tabs">
      <div className="tabs__controls">
        <span className="tabs__name">{tab.name}</span>
        <span className="setting-note">{error ?? (saved ? 'Saved' : 'Saving…')}</span>
      </div>

      <div
        className="well tabs__sheet"
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
          <div className="tabs__line" key={index}>
            {place !== null && place.line === index ? (
              <>
                {line.slice(0, place.column)}
                <span className="tabs__cursor">{line[place.column] ?? ' '}</span>
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
