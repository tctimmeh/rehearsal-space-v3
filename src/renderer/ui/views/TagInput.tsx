import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { normaliseTag, suggestTags } from '@core/song/tags'

const LIST_WIDTH = 190
const GAP = 4
const EDGE = 8

/**
 * Types a tag, offering the ones other songs already use.
 *
 * Right in the row rather than in a dialog: a tag is a word, and going
 * somewhere else to write a word costs more than the word is worth. The
 * suggestions are drawn through a portal because the library scrolls, and a
 * list drawn inside the scroller is cut off at its edge.
 */
export function TagInput({
  known,
  alreadyOn,
  onAdd,
  onDone
}: {
  known: readonly string[]
  alreadyOn: readonly string[]
  onAdd: (tag: string) => void
  onDone: () => void
}) {
  const [typed, setTyped] = useState('')
  const [at, setAt] = useState({ left: 0, top: 0 })
  const field = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const offered = suggestTags(known, typed, alreadyOn).slice(0, 8)

  useEffect(() => {
    field.current?.focus()
  }, [])

  useLayoutEffect(() => {
    const rect = field.current?.getBoundingClientRect()
    if (rect === undefined) return
    setAt({
      left: Math.min(rect.left, window.innerWidth - LIST_WIDTH - EDGE),
      top: rect.bottom + GAP
    })
  }, [offered.length])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (field.current?.contains(target) === true) return
      if (list.current?.contains(target) === true) return
      onDone()
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [onDone])

  const commit = (tag: string) => {
    if (normaliseTag(tag) === '') {
      onDone()
      return
    }
    onAdd(tag)
    setTyped('')
    field.current?.focus()
  }

  return (
    <>
      <input
        ref={field}
        className="well input tag-input"
        value={typed}
        aria-label="New tag"
        placeholder="tag"
        maxLength={40}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit(typed)
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onDone()
          }
        }}
      />

      {offered.length === 0
        ? null
        : createPortal(
            <div
              ref={list}
              className="menu tag-suggestions"
              role="listbox"
              style={{ left: at.left, top: at.top, width: LIST_WIDTH }}
            >
              {offered.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="menu__item"
                  onClick={() => commit(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>,
            document.body
          )}
    </>
  )
}
