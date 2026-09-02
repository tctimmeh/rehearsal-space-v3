import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'

import {
  AT_START,
  deleteNote,
  moveDown,
  moveLeft,
  moveRight,
  moveUp,
  chordAt,
  markWith,
  nameSection,
  openSection,
  nameChord,
  QUICK_MS,
  setBeats,
  settle,
  subdivide,
  typeFret,
  typeMute,
  type Editing
} from '@core/tab/edit'
import {
  setStrings,
  STRINGS_MAX,
  STRINGS_MIN,
  TECHNIQUES,
  type Beat,
  type TabDoc,
  type Technique
} from '@core/tab/document'
import {
  asDocument,
  beatAtIndex,
  beatIndexOf,
  clearBeats,
  copyBeats,
  pasteBeats,
  totalBeats,
  type Span
} from '@core/tab/clip'
import {
  begin as beginHistory,
  canRedo,
  canUndo,
  redo,
  remember,
  undo,
  type History
} from '@core/tab/history'
import { inkOf, rowsOf, type Ink, type Row } from '@core/tab/ink'
import {
  blocksOf,
  cursorAtPlace,
  wordsAboveCursor,
  placeOf,
  render,
  WRAP_COLUMNS,
  type Block
} from '@core/tab/render'
import type { TabFile } from '@core/song/song'
import { newTabFile } from '@core/tab/files'
import { useSong } from '@renderer/state/song'
import { useTabs } from '@renderer/state/tabs'
import { isTyping } from '@renderer/state/hotkeys'
import { Button, useSelectOnOpen, wasEscapeAnswered } from '../primitives'
import { TabKeysModal } from './TabKeysModal'

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
  const updateSong = useSong((state) => state.update)
  const doc = useTabs((state) => state.doc)
  const revision = useTabs((state) => state.revision)
  const openTab = useTabs((state) => state.open)
  const tabId = useTabs((state) => state.tabId)
  const edit = useTabs((state) => state.edit)
  const saved = useTabs((state) => state.saved)
  const error = useTabs((state) => state.error)

  const [cursor, setCursor] = useState(AT_START)
  /*
   * Where the cursor is now, rather than where it was when this last drew.
   * Leaving the words moves it and then lets go of them, and the letting go
   * arrives after the move — answering it from the drawn value would put the
   * cursor back where it came from, which for a move upwards is downwards.
   */
  const standing = useRef(cursor)
  standing.current = cursor
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
  /** True while the chord over the cursor's beat is being written. */
  const [naming, setNaming] = useState(false)
  /** True while the list of what the editor answers to is up. */
  const [showingKeys, setShowingKeys] = useState(false)
  /**
   * The bar whose section words are being typed, or null while the cursor is
   * in the music.
   *
   * The words are ordinary prose and want ordinary text editing, so they are
   * a field rather than something the block cursor is moved over.
   */
  const [writing, setWriting] = useState<number | null>(null)
  /**
   * The beats picked out, counted straight through the document.
   *
   * Whole beats, never part of one: a bar's worth of music is all six strings
   * at once, and taking the top string alone would take a shape nobody played.
   */
  const [span, setSpan] = useState<Span | null>(null)
  const clipboard = useRef<Beat[]>([])
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

  useEscapeReturnsHere(field)

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

  /*
   * Drawn a paragraph at a time — a system, or the words above one — so that
   * scrolling can think in whole bars, and the words are typed into where they
   * are read rather than into a box somewhere else.
   */
  const blocks = useMemo(() => withRoomToWrite(doc, columns, writing), [doc, columns, writing])
  const place = placeOf(doc, cursor, columns)
  /* Where the chord for this beat is drawn: over the beat's first slot, on the
     row above the beat numbers. The field is put exactly there. */
  const overBeat = naming ? placeOf(doc, { ...cursor, slot: 0 }, columns) : null
  /* Which system each block is, for the one that has to be scrolled to. */
  const ordinals = useMemo(() => {
    let seen = -1
    return blocks.map((block) => (block.system === undefined ? -1 : (seen += 1)))
  }, [blocks])

  /**
   * Which columns of which lines are picked out.
   *
   * A beat runs from where it begins to where the next one does, so the range
   * is taken from the beat after the last one selected — and where that is on
   * another line, to the end of this one.
   */
  const picked = useMemo(() => {
    const ranges = new Map<number, [number, number]>()
    if (span === null) return ranges
    const from = Math.min(span.from, span.to)
    const to = Math.max(span.from, span.to)

    for (let index = from; index <= to; index += 1) {
      const at = beatAtIndex(doc, index)
      if (at === null) continue
      const head = placeOf(doc, { bar: at.bar, beat: at.beat, slot: 0, string: 0 }, columns)
      if (head === null) continue

      const after = beatAtIndex(doc, index + 1)
      const tail =
        after === null
          ? null
          : placeOf(doc, { bar: after.bar, beat: after.beat, slot: 0, string: 0 }, columns)
      const end = tail !== null && tail.system === head.system ? tail.column : Infinity

      for (let string = 0; string < doc.strings; string += 1) {
        const line = head.line + string
        const held = ranges.get(line)
        ranges.set(
          line,
          held === undefined
            ? [head.column, end]
            : [Math.min(held[0], head.column), Math.max(held[1], end)]
        )
      }
    }
    return ranges
  }, [span, doc, columns])

  if (song === null) return <p className="tool-placeholder">No song loaded.</p>
  if (tab === null) return <NoTabYet />

  /*
   * Clicking puts the cursor on the nearest slot to wherever the pointer
   * landed — nearest in both directions, because a click lands where it lands.
   * Aiming between two systems, or past the end of the last one, should still
   * mean something rather than nothing at all.
   */
  const onPointerDown = (event: React.PointerEvent): void => {
    /* A click in the words is asking for a caret in the words. Taking focus
       back for the sheet would put it straight back in the music. */
    if ((event.target as HTMLElement).closest('.tablature__words') !== null) return

    field.current?.focus()
    const sheet = field.current
    /* Pointing somewhere is asking for the cursor to be there, which means
       giving up whatever was picked out — while beats are chosen there is no
       cursor drawn at all, so a click that only changed it would look dead. */
    setSpan(null)
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

  /**
   * Steps out of the words, into the music above or below them.
   *
   * Settling on the way is what re-joins the two systems when the words have
   * all been deleted: an unnamed section is not a section, and closing it is
   * exactly what leaving an emptied sixteenth does.
   */
  const leaveWords = (bar: number, way: 'up' | 'down' | 'away'): void => {
    setWriting(null)
    /* Clicking elsewhere is leaving too, but it is not asking for the cursor
       to be put anywhere in particular — whatever was clicked has already said
       where it goes. Settling is what closes a section left unnamed. */
    if (way === 'away') {
      apply({ doc: useTabs.getState().doc, cursor: standing.current }, true)
      return
    }
    const above = way === 'up' && bar > 0
    const to = {
      bar: above ? bar - 1 : bar,
      beat: 0,
      slot: 0,
      string: above ? doc.strings - 1 : 0
    }
    standing.current = to
    apply({ doc: useTabs.getState().doc, cursor: to }, true)
    field.current?.focus()
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

  /** Puts the cursor on the first beat of a span, so typing carries on there. */
  const leaveSelection = (at: number): void => {
    const place = beatAtIndex(doc, at)
    setSpan(null)
    if (place !== null) setCursor({ ...cursor, bar: place.bar, beat: place.beat, slot: 0 })
  }

  const selectKeys = (event: React.KeyboardEvent, chosen: Span): boolean => {
    const state: Editing = { doc, cursor }
    const key = event.key.toLowerCase()
    /* Cut, copy and paste are held with control, the way they are everywhere
       else. The bare letters are a fret's worth of typing: `x` is a muted
       string, and taking it for "cut" here would have been the only place in
       the app where a plain letter threw music away. */
    const held = event.ctrlKey || event.metaKey

    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const to = Math.max(
        0,
        Math.min(totalBeats(doc) - 1, chosen.to + (event.key === 'ArrowRight' ? 1 : -1))
      )
      setSpan({ ...chosen, to })
      return true
    }

    if (held && key === 'c') {
      clipboard.current = copyBeats(doc, chosen)
      void navigator.clipboard?.writeText(render(asDocument(clipboard.current, doc.strings)))
      leaveSelection(chosen.from)
      return true
    }

    if (held && key === 'x') {
      clipboard.current = copyBeats(doc, chosen)
      void navigator.clipboard?.writeText(render(asDocument(clipboard.current, doc.strings)))
      apply({ ...state, doc: clearBeats(doc, chosen) }, false)
      leaveSelection(Math.min(chosen.from, chosen.to))
      return true
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      apply({ ...state, doc: clearBeats(doc, chosen) }, false)
      leaveSelection(Math.min(chosen.from, chosen.to))
      return true
    }

    if (event.key === 'Escape' || key === 's') {
      leaveSelection(Math.min(chosen.from, chosen.to))
      return true
    }

    return false
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const held = event.ctrlKey || event.metaKey

    /* Picking out beats has its own keys while it lasts. */
    if (span !== null) {
      if (selectKeys(event, span)) {
        event.preventDefault()
        return
      }
      if (!held) {
        leaveSelection(Math.min(span.from, span.to))
      }
    }

    /* Escape steps out of the tablature altogether. Every key lands here
       while this has the cursor, including the app's own, so there has to be
       a way of putting it down that is not reaching for the mouse. Leaving a
       selection is the first thing Escape does, and is handled above; this is
       what it means once there is nothing left to leave. */
    if (event.key === 'Escape') {
      field.current?.blur()
      /* Answered, so that the press does not come straight back here. */
      event.preventDefault()
      return
    }

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

    /* A section begins at the bar the cursor is in, with room above it to say
       what the section is. */
    if (held && event.key.toLowerCase() === 't') {
      const opened = openSection(state)
      apply(opened, false)
      /* From the opened state, not from this one: making room for the section
         above puts a bar in front of this one, which moves it down. */
      setWriting(opened.cursor.bar)
      event.preventDefault()
      return
    }

    /* Up out of the tablature is where the chords are written. */
    if (held && event.key === 'ArrowUp') {
      setNaming(true)
      event.preventDefault()
      return
    }

    if (!held && !event.altKey && event.key.toLowerCase() === 's') {
      const at = beatIndexOf(doc, cursor)
      setSpan({ from: at, to: at })
      event.preventDefault()
      return
    }

    if (held && event.key.toLowerCase() === 'v') {
      if (clipboard.current.length > 0) {
        return void step(event, { doc: pasteBeats(doc, cursor, clipboard.current), cursor })
      }
      event.preventDefault()
      return
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return

    if (TECHNIQUES.includes(event.key as Technique) && event.key !== '-') {
      return void step(event, markWith(state, event.key as Technique))
    }

    if (event.key === 'ArrowUp' && cursor.string === 0) {
      const opening = wordsAboveCursor(doc, cursor, columns)
      if (opening !== null) {
        setWriting(opening)
        event.preventDefault()
        return
      }
    }

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

  /**
   * A different instrument for this file.
   *
   * The document is what gets drawn and written down, so it is what changes;
   * the song's own note of the count is kept in step so that the next file
   * started here is for the same instrument.
   */
  const changeStrings = (wanted: number): void => {
    const next = setStrings(doc, wanted)
    if (next === doc) return
    setSpan(null)
    apply({ doc: next, cursor: { ...cursor, string: Math.min(cursor.string, next.strings - 1) } }, false)
    void updateSong({
      tabs: song.tabs.map((entry) =>
        entry.id === tab.id ? { ...entry, strings: next.strings } : entry
      )
    })
  }

  return (
    <div className="tablature">
      <div className="tablature__controls">
        <TabPicker tabs={song.tabs} showing={tab} />
        <label className="tablature__pick">
          <span>Strings</span>
          <select
            className="well input"
            value={doc.strings}
            aria-label="Strings"
            onChange={(event) => changeStrings(Number(event.target.value))}
          >
            {STRING_COUNTS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        <span className="setting-note">{error ?? (saved ? 'Saved' : 'Saving…')}</span>
        <Button
          className="tablature__help"
          aria-label="Tablature keys"
          title="Tablature keys"
          onClick={() => setShowingKeys(true)}
        >
          ?
        </Button>
      </div>

      {showingKeys ? (
        <TabKeysModal
          onDismiss={() => {
            setShowingKeys(false)
            field.current?.focus()
          }}
        />
      ) : null}

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
        {blocks.map((block, index) =>
          block.kind === 'words' ? (
            <SectionWords
              key={`words-${block.bar}`}
              lines={block.lines}
              writing={writing === block.bar}
              /* From the store rather than from this render: typing outruns
                 what React has committed, and a keystroke written onto a copy
                 that has not caught up is a keystroke thrown away. */
              onWrite={(words) => edit(nameSection(useTabs.getState().doc, block.bar, words))}
              onEnter={() => setWriting(block.bar)}
              onLeave={(way) => leaveWords(block.bar, way)}
            />
          ) : (
            <div
              className={
                overBeat !== null && ordinals[index] === overBeat.system && !hasChordRow(block, doc)
                  ? 'tablature__system tablature__system--naming'
                  : 'tablature__system'
              }
              key={`system-${block.from}`}
              ref={ordinals[index] === place?.system ? showing : undefined}
            >
              {overBeat !== null && ordinals[index] === overBeat.system ? (
                <ChordField
                  at={overBeat.column}
                  chord={chordAt(doc, cursor)}
                  onChange={(chord) => apply(nameChord({ doc, cursor }, chord), false)}
                  onDone={() => {
                    setNaming(false)
                    field.current?.focus()
                  }}
                />
              ) : null}
              {block.lines.map((line, offset) => {
                const at = block.from + offset
                return (
                  <div className="tablature__line" key={offset} data-line={at}>
                    {drawLine(
                      line,
                      rowsOf(block.lines.length, doc.strings)[offset] ?? 'string',
                      at,
                      place,
                      picked.get(at)
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}

/**
 * An Escape nobody answered brings the cursor back to the tablature.
 *
 * Escape steps out of the editor, and short of reaching for the mouse there is
 * no way back in — which leaves the one key that is otherwise doing nothing.
 * Everything that opens over the app closes on Escape and says so as it goes,
 * so a press that went unanswered is a press with nothing left to close, and
 * belongs to whatever is on the stage.
 *
 * Asked from a timeout because the answer arrives during the keystroke: the
 * listeners that might give it are on the window too, in whatever order they
 * happened to be added, and only once it has been all the way round is the
 * silence real. A press aimed at a field is left alone whatever comes of it —
 * taking the cursor off somebody mid-word is worse than doing nothing.
 */
function useEscapeReturnsHere(field: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || isTyping(event.target)) return
      setTimeout(() => {
        if (wasEscapeAnswered(event)) return
        field.current?.focus()
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
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
 * Which of a song's tablatures is being written, and the making and unmaking
 * of them.
 *
 * A song has a lead line and a rhythm part and a bass, and they are different
 * pieces of writing rather than one long one — so they are separate files,
 * listed on the song, and this is where you move between them.
 */
function TabPicker({ tabs, showing }: { tabs: TabFile[]; showing: TabFile }) {
  const song = useSong((state) => state.song)
  const update = useSong((state) => state.update)
  const open = useTabs((state) => state.open)
  const flush = useTabs((state) => state.flush)
  const [renaming, setRenaming] = useState(false)
  const selectName = useSelectOnOpen<HTMLInputElement>()

  const show = (id: string): void => {
    const wanted = tabs.find((tab) => tab.id === id)
    if (song === null || wanted === undefined || wanted.id === showing.id) return
    /* What is on screen is written before something else takes its place. */
    void flush().then(() => open(song.id, wanted))
  }

  const add = (): void => {
    if (song === null) return
    const made = newTabFile(song.tabs, 'Tab', showing.strings)
    void update({ tabs: [...song.tabs, made] })
    void flush().then(() => open(song.id, made))
  }

  const rename = (name: string): void => {
    if (song === null || name.trim() === '') return
    update({
      tabs: song.tabs.map((tab) => (tab.id === showing.id ? { ...tab, name: name.trim() } : tab))
    })
  }

  /*
   * Removing one leaves its file where it is.
   *
   * Nothing else in the app deletes a file somebody wrote without asking, and
   * a tablature is somebody's work — the entry goes, the writing stays, and a
   * mistake costs a line in song.json rather than an afternoon.
   */
  const remove = (): void => {
    if (song === null || song.tabs.length <= 1) return
    const left = song.tabs.filter((tab) => tab.id !== showing.id)
    void update({ tabs: left })
    const next = left[0]
    if (next !== undefined) void flush().then(() => open(song.id, next))
  }

  if (renaming) {
    return (
      <label className="tablature__chord">
        <span>Name</span>
        <input
          className="well input"
          autoFocus
          ref={selectName}
          defaultValue={showing.name}
          aria-label="Tablature name"
          onChange={(event) => rename(event.target.value)}
          onBlur={() => setRenaming(false)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== 'Escape') return
            event.preventDefault()
            setRenaming(false)
          }}
        />
      </label>
    )
  }

  return (
    <>
      <label className="tablature__pick">
        <span>Tablature</span>
        <select
          className="well input"
          value={showing.id}
          aria-label="Which tablature"
          onChange={(event) => show(event.target.value)}
        >
          {tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.name}
            </option>
          ))}
        </select>
      </label>
      <Button onClick={() => setRenaming(true)}>Rename</Button>
      <Button onClick={add}>Add</Button>
      <Button onClick={remove} disabled={tabs.length <= 1}>
        Remove
      </Button>
    </>
  )
}

/** Four for a bass, six for a guitar, and the ones either side of them. */
const STRING_COUNTS = Array.from(
  { length: STRINGS_MAX - STRINGS_MIN + 1 },
  (_, step) => STRINGS_MIN + step
)

/**
 * The paragraphs to draw, with room made for a section just opened.
 *
 * A section with nothing written above it yet cannot be drawn — there is
 * nothing to draw — but it still has to be somewhere for the first word to be
 * typed into, so an empty one is put back in front of the system it opens.
 */
function withRoomToWrite(doc: TabDoc, columns: number, writing: number | null): Block[] {
  const blocks = blocksOf(doc, columns)
  if (writing === null || blocks.some((block) => block.kind === 'words' && block.bar === writing)) {
    return blocks
  }
  const at = blocks.findIndex((block) => block.system !== undefined && block.bar === writing)
  if (at === -1) return blocks
  const opening: Block = { kind: 'words', lines: [''], from: blocks[at]?.from ?? 0, bar: writing }
  return [...blocks.slice(0, at), opening, ...blocks.slice(at)]
}

/**
 * The words above a section: its name, or a note on how to play it.
 *
 * Prose rather than music, so it is a real text field with a real caret. Up
 * off the top line and down off the bottom leave it for the music either side,
 * which is the only way in and out that does not need the mouse.
 */
function SectionWords({
  lines,
  writing,
  onWrite,
  onEnter,
  onLeave
}: {
  lines: string[]
  writing: boolean
  onWrite: (words: string) => void
  onEnter: () => void
  onLeave: (way: 'up' | 'down' | 'away') => void
}) {
  const field = useRef<HTMLTextAreaElement>(null)
  const words = lines.join('\n')

  useEffect(() => {
    if (writing) field.current?.focus()
  }, [writing])

  return (
    <div className="tablature__words">
      <textarea
        ref={field}
        className="tablature__field"
        aria-label="Section words"
        value={words}
        rows={Math.max(1, lines.length)}
        spellCheck={false}
        placeholder="Verse, chorus, or how to play it"
        onChange={(event) => onWrite(event.target.value)}
        onFocus={onEnter}
        onBlur={() => onLeave('away')}
        onKeyDown={(event) => {
          /* The field sits inside the sheet, whose own handler answers for
             every key: `s` would start picking out beats instead of being
             typed, and Escape would step out of the tablature altogether. In
             here the keys are this field's. */
          event.stopPropagation()
          const caret = event.currentTarget.selectionStart
          const onFirst = !words.slice(0, caret).includes('\n')
          const onLast = !words.slice(caret).includes('\n')
          if (event.key === 'ArrowUp' && onFirst) {
            event.preventDefault()
            onLeave('up')
          }
          if ((event.key === 'ArrowDown' && onLast) || event.key === 'Escape') {
            event.preventDefault()
            onLeave('down')
          }
        }}
      />
    </div>
  )
}

const INK_CLASS: Record<Ink, string> = {
  note: 'tablature__note',
  beat: 'tablature__beat',
  bar: 'tablature__bar',
  sub: 'tablature__sub',
  chord: 'tablature__name',
  plain: ''
}

/** The stretch of a line drawn as something other than what it is made of. */
interface Marked {
  from: number
  to: number
  className: string
}

/**
 * One line, weighted by what each character is, and carrying whatever is on
 * it: the block cursor, or the stretch picked out, or neither. Never both —
 * while beats are being chosen there is nothing for a cursor standing on one
 * moment to say.
 *
 * Characters are gathered into the longest runs that look alike, so a bar of
 * dashes stays one piece of text rather than becoming a span apiece.
 */
function drawLine(
  line: string,
  row: Row,
  index: number,
  place: { line: number; column: number } | null,
  range: [number, number] | undefined
): ReactNode {
  const standing = place !== null && place.line === index ? place.column : null
  const marked: Marked | null =
    range !== undefined
      ? { from: range[0], to: range[1], className: 'tablature__picked' }
      : standing !== null
        ? { from: standing, to: standing + 1, className: 'tablature__cursor' }
        : null

  /* The cursor can stand past the end of a line, where the trailing dashes
     were trimmed away; it still has to be drawn, on a space. */
  const text = line.padEnd(standing === null ? 0 : standing + 1, ' ')
  if (text === '') return ' '

  const inks = inkOf(text, row)
  const parts: ReactNode[] = []
  let run = ''
  let wearing = ''

  const flush = (): void => {
    if (run === '') return
    parts.push(
      wearing === '' ? (
        run
      ) : (
        <span key={parts.length} className={wearing}>
          {run}
        </span>
      )
    )
    run = ''
  }

  for (let column = 0; column < text.length; column += 1) {
    const inside = marked !== null && column >= marked.from && column < marked.to
    const classes = [INK_CLASS[inks[column] ?? 'plain'], inside ? marked.className : '']
      .filter((name) => name !== '')
      .join(' ')
    if (classes !== wearing) {
      flush()
      wearing = classes
    }
    run += text[column]
  }
  flush()

  return <>{parts}</>
}

/** Whether this system is already drawing a row for chords. */
const hasChordRow = (block: Block, doc: TabDoc): boolean =>
  rowsOf(block.lines.length, doc.strings)[0] === 'chord'

/**
 * Where a chord is written.
 *
 * A field rather than a cursor in the drawing: a chord is ordinary text and
 * wants ordinary text editing — backspace, arrows within the word — which a
 * block cursor standing on a moment cannot give.
 *
 * It sits exactly where the chord will be: over the beat, on the row above the
 * beat numbers. Naming a chord in a box above the editor meant looking away
 * from the bar being named to type, and back again to see what happened.
 */
function ChordField({
  at,
  chord,
  onChange,
  onDone
}: {
  /** The column it stands on, in characters of the drawing. */
  at: number
  chord: string
  onChange: (chord: string) => void
  onDone: () => void
}) {
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => box.current?.focus(), [])

  return (
    <input
      ref={box}
      className="tablature__chord"
      /* Counted in characters rather than measured in pixels: the drawing is
         a grid of them, and one `ch` is one of them by definition. */
      style={{ left: `${at}ch` }}
      value={chord}
      aria-label="Chord"
      spellCheck={false}
      size={Math.max(4, chord.length + 1)}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        /* The sheet answers for every key it is given, and these are this
           field's: `s` would start picking out beats rather than spelling a
           suspended chord. */
        event.stopPropagation()
        if (event.key === 'Escape' || event.key === 'Enter' || event.key === 'ArrowDown') {
          onDone()
          event.preventDefault()
        }
      }}
    />
  )
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
  /* Only the drawn rows: the words above a section are a field of their own
     and answer for where their caret goes. */
  for (const row of sheet.querySelectorAll<HTMLElement>('.tablature__line[data-line]')) {
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
