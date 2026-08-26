import { useEffect, useRef } from 'react'

import type { Rhyme } from '@core/rhymes/rhymes'
import { editorIsOpen, insertIntoLyrics } from '@renderer/state/lyrics'
import { useRhymes } from '@renderer/state/rhymes'
import { Button } from '../primitives'

/**
 * Rhymes for a word, to consult and dismiss.
 *
 * Perfect ones first, then the near ones — the near ones are why this is here
 * rather than in a paper dictionary, since a rhyme that only nearly rhymes is
 * usually the more interesting line.
 */
export function RhymesDrawer() {
  const typed = useRhymes((state) => state.typed)
  const found = useRhymes((state) => state.found)
  const rhymes = useRhymes((state) => state.rhymes)
  const looking = useRhymes((state) => state.looking)
  const error = useRhymes((state) => state.error)
  const type = useRhymes((state) => state.type)
  const look = useRhymes((state) => state.look)

  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    field.current?.focus()
  }, [])

  const nothingFound =
    found !== '' && !looking && error === null && rhymes.perfect.length + rhymes.near.length === 0

  return (
    <div className="rhymes">
      <form
        className="rhymes__ask"
        onSubmit={(event) => {
          event.preventDefault()
          void look()
        }}
      >
        <input
          ref={field}
          className="well input rhymes__word"
          value={typed}
          spellCheck={false}
          aria-label="Word"
          placeholder="a word"
          onChange={(event) => type(event.target.value)}
        />
        <Button type="submit" disabled={looking}>
          {looking ? '…' : 'Find'}
        </Button>
      </form>

      {error !== null ? <p className="rhymes__note rhymes__note--bad">{error}</p> : null}
      {nothingFound ? <p className="rhymes__note">Nothing rhymes with “{found}”.</p> : null}

      <div className="rhymes__lists">
        <Group name="Perfect" rhymes={rhymes.perfect} />
        <Group name="Near" rhymes={rhymes.near} />
      </div>

      {rhymes.perfect.length + rhymes.near.length === 0 || editorIsOpen() ? null : (
        <p className="rhymes__note">Open the lyrics editor to put one in a line.</p>
      )}
    </div>
  )
}

function Group({ name, rhymes }: { name: string; rhymes: Rhyme[] }) {
  if (rhymes.length === 0) return null
  return (
    <div className="rhymes__group">
      <div className="rhyme-group">{name}</div>
      <div className="rhyme-grid">
        {rhymes.map((rhyme) => (
          <button
            key={rhyme.word}
            type="button"
            className="rhyme"
            title={editorIsOpen() ? 'Put it where the cursor is' : rhyme.word}
            onClick={() => insertIntoLyrics(rhyme.word)}
          >
            <b>{rhyme.word}</b>
            <span>{rhyme.syllables}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
