import { useEffect, useMemo, useRef } from 'react'

import { classifyLine, piecesOf } from '@core/lyrics/chords'
import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import { useLyrics } from '@renderer/state/lyrics'
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

/** Chord charts are written in columns, and a tab is how a column is reached. */
const TAB_STOP = 4

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
  const saved = useLyrics((state) => state.saved)
  const error = useLyrics((state) => state.error)
  const edit = useLyrics((state) => state.edit)
  const transpose = useLyrics((state) => state.transpose)

  const input = useRef<HTMLTextAreaElement>(null)
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

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const field = event.currentTarget
    const at = field.selectionStart
    const column = at - (text.lastIndexOf('\n', at - 1) + 1)
    const spaces = TAB_STOP - (column % TAB_STOP)
    const next = `${text.slice(0, at)}${' '.repeat(spaces)}${text.slice(field.selectionEnd)}`
    edit(next)
    requestAnimationFrame(() => {
      field.selectionStart = at + spaces
      field.selectionEnd = at + spaces
    })
  }

  if (song === null) return <p className="stage-empty">No song loaded.</p>

  return (
    <div
      className="lyrics"
      style={
        {
          '--section-color': CHANNEL_SUBJECT_COLOR.vocals,
          '--chord-color': CHANNEL_SUBJECT_COLOR.acoustic
        } as React.CSSProperties
      }
    >
      <div className="lyrics__bar">
        <span className="lyrics__label">Transpose</span>
        <Button onClick={() => transpose(-1)} title="Every chord down a semitone">
          −
        </Button>
        <Button onClick={() => transpose(1)} title="Every chord up a semitone">
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
            value={text}
            spellCheck={false}
            aria-label="Lyrics"
            placeholder={'[Verse 1]\nC       Am\nWrite the words here'}
            onChange={(event) => edit(event.target.value)}
            onScroll={follow}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
    </div>
  )
}
