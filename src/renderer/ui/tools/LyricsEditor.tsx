import { useEffect, useMemo, useRef } from 'react'

import { classifyLine, piecesOf } from '@core/lyrics/chords'
import {
  beginHistory,
  canRedo,
  canUndo,
  record,
  redo,
  undo,
  type History,
  type Recording
} from '@core/lyrics/undo'
import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import { lendCursor, useLyrics } from '@renderer/state/lyrics'
import { useSong } from '@renderer/state/song'
import { Button } from '../primitives'

/**
 * A line, with anything in brackets marked as a remark.
 *
 * Remarks are notes to yourself — a fingering, a reminder that a line is
 * awkward, how many times to repeat the intro — so they are shown as quieter
 * than the song they are written beside, whatever kind of line they sit on.
 */
function Coloured({ line }: { line: string }) {
  const parts: { text: string; comment: boolean }[] = []
  let at = 0
  for (const piece of piecesOf(line)) {
    if (!piece.comment) continue
    if (piece.at > at) parts.push({ text: line.slice(at, piece.at), comment: false })
    parts.push({ text: piece.text, comment: true })
    at = piece.at + piece.text.length
  }
  if (at < line.length) parts.push({ text: line.slice(at), comment: false })

  return (
    <>
      {parts.map((part, index) =>
        part.comment ? (
          <span key={index} className="editor__comment">
            {part.text}
          </span>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </>
  )
}

const fresh = (text: string): Recording => ({
  history: beginHistory({ text, caret: text.length }),
  edit: { kind: 'none', at: 0, inserted: '', removed: '' },
  length: 0
})

/** Chord charts are written in columns, and a tab is how a column is reached. */
const TAB_STOP = 4

/**
 * Types text into a field as though a person had typed it.
 *
 * Setting the value instead — which is what React does when the text comes
 * from state — replaces the whole thing, and a text area whose value is
 * replaced loses two things a writer needs: where it was scrolled to, and
 * every undo it had. Going through the editing command keeps both, and the
 * change comes back through onChange like any other keystroke.
 *
 * The command is old and deprecated and there is still no replacement for it.
 */
function typeInto(field: HTMLTextAreaElement, text: string): boolean {
  field.focus()
  try {
    return document.execCommand('insertText', false, text)
  } catch {
    return false
  }
}

/** The same, for text that replaces everything: transposing rewrites the lot. */
function retypeAll(field: HTMLTextAreaElement, text: string): boolean {
  const { selectionStart, selectionEnd, scrollTop, scrollLeft } = field
  field.focus()
  field.setSelectionRange(0, field.value.length)
  if (!typeInto(field, text)) return false
  field.setSelectionRange(
    Math.min(selectionStart, text.length),
    Math.min(selectionEnd, text.length)
  )
  field.scrollTop = scrollTop
  field.scrollLeft = scrollLeft
  return true
}

/**
 * The words of a song, as plain text.
 *
 * A real text area rather than something clever: it is what gives keyboard
 * behaviour, undo, and copying in and out of everything else for free, which
 * is most of what the editor is for. What sits behind it is a copy of the same
 * text, coloured — the way any editor in a browser does it.
 */
export function LyricsEditor() {
  const song = useSong((state) => state.song)
  const text = useLyrics((state) => state.text)
  const revision = useLyrics((state) => state.revision)
  const saved = useLyrics((state) => state.saved)
  const error = useLyrics((state) => state.error)
  const edit = useLyrics((state) => state.edit)
  const replace = useLyrics((state) => state.replace)
  const transposeText = useLyrics((state) => state.transposed)

  const input = useRef<HTMLTextAreaElement>(null)
  const history = useRef<Recording>(fresh(text))
  /* Set while an undo is being applied, so it is not recorded as an edit. */
  const applying = useRef(false)
  const lastEditAt = useRef(0)
  const behind = useRef<HTMLPreElement>(null)
  const gutter = useRef<HTMLDivElement>(null)

  const lines = useMemo(() => text.split('\n'), [text])

  /* The coloured copy and the numbers do not scroll themselves; they are moved
     to wherever the text area has been scrolled to. */
  const follow = () => {
    const source = input.current
    if (source === null) return
    if (behind.current !== null) {
      behind.current.scrollTop = source.scrollTop
      behind.current.scrollLeft = source.scrollLeft
    }
    if (gutter.current !== null) gutter.current.scrollTop = source.scrollTop
  }

  useEffect(follow, [text])

  /**
   * The field holds its own text, and is written into only when the words
   * came from somewhere else — a different song, or a rewrite it could not be
   * asked to type itself.
   *
   * Anything else loses the undo history. A field handed its own text back
   * after every keystroke cannot group typing into steps, and one written to
   * while an undo is being applied fights the undo and wins.
   */
  useEffect(() => {
    const field = input.current
    if (field === null) return
    const words = useLyrics.getState().text
    if (field.value !== words) field.value = words
    /* A different song is a different history. */
    history.current = fresh(words)
  }, [revision])

  /* While the editor is open, anything that has a word to offer — the rhymes
     drawer — can put it where the caret is. */
  useEffect(
    () =>
      lendCursor((word) => {
        const field = input.current
        if (field === null) return
        if (typeInto(field, word)) return

        const current = useLyrics.getState().text
        const at = field.selectionStart
        const end = field.selectionEnd
        useLyrics.getState().replace(`${current.slice(0, at)}${word}${current.slice(end)}`)
        requestAnimationFrame(() => {
          field.focus()
          field.selectionStart = at + word.length
          field.selectionEnd = at + word.length
        })
      }),
    [edit]
  )

  const remember = (field: HTMLTextAreaElement) => {
    if (applying.current) return
    const now = performance.now()
    history.current = record(
      history.current,
      { text: field.value, caret: field.selectionStart },
      now - lastEditAt.current
    )
    lastEditAt.current = now
  }

  const goTo = (next: History) => {
    const field = input.current
    if (field === null) return
    applying.current = true
    if (!retypeAll(field, next.present.text)) replace(next.present.text)
    field.setSelectionRange(next.present.caret, next.present.caret)
    applying.current = false

    history.current = { ...history.current, history: next }
    edit(field.value)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const undoing = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z'
    const redoing =
      (event.ctrlKey || event.metaKey) &&
      (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))

    if (redoing) {
      event.preventDefault()
      if (canRedo(history.current.history)) goTo(redo(history.current.history))
      return
    }
    if (undoing) {
      event.preventDefault()
      if (canUndo(history.current.history)) goTo(undo(history.current.history))
      return
    }

    if (event.key !== 'Tab') return
    event.preventDefault()
    const field = event.currentTarget
    const at = field.selectionStart
    const column = at - (text.lastIndexOf('\n', at - 1) + 1)
    const spaces = ' '.repeat(TAB_STOP - (column % TAB_STOP))

    if (typeInto(field, spaces)) return
    /* No editing command: keep the tab working, undo or no undo. */
    replace(`${text.slice(0, at)}${spaces}${text.slice(field.selectionEnd)}`)
    requestAnimationFrame(() => {
      field.selectionStart = at + spaces.length
      field.selectionEnd = at + spaces.length
    })
  }

  /* Through the field rather than through state, so a transposition can be
     undone like any other edit and the view stays where it was. */
  const move = (semitones: number) => {
    const next = transposeText(semitones)
    const field = input.current
    if (field === null || !retypeAll(field, next)) replace(next)
  }

  if (song === null) return <p className="stage-empty">No song loaded.</p>

  return (
    <div
      className="lyrics"
      style={
        {
          /* Teal against the chords' gold: warm and cool separate at a glance,
             where two warm colours read as the same thing. */
          '--section-color': CHANNEL_SUBJECT_COLOR.lyrics,
          '--chord-color': CHANNEL_SUBJECT_COLOR.acoustic
        } as React.CSSProperties
      }
    >
      <div className="lyrics__bar">
        <span className="lyrics__label">Transpose</span>
        <Button onClick={() => move(-1)} title="Every chord down a semitone">
          −
        </Button>
        <Button onClick={() => move(1)} title="Every chord up a semitone">
          +
        </Button>
        <span className="lyrics__state">
          {error ?? (saved ? `Saved · ${lines.length} lines` : 'Saving…')}
        </span>
      </div>

      <div className="editor">
        <div className="editor__gutter" ref={gutter}>
          {lines.map((_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>

        <div className="editor__pane">
          <pre className="editor__behind" ref={behind} aria-hidden="true">
            {lines.map((line, index) => (
              <div key={index} className={`editor__line editor__line--${classifyLine(line)}`}>
                {line === '' ? ' ' : <Coloured line={line} />}
              </div>
            ))}
          </pre>
          <textarea
            ref={input}
            className="editor__input"
            defaultValue={text}
            spellCheck={false}
            aria-label="Lyrics"
            placeholder={'[Verse 1]\nC       Am\nWrite the words here'}
            onChange={(event) => {
              remember(event.currentTarget)
              edit(event.target.value)
            }}
            onScroll={follow}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
    </div>
  )
}
