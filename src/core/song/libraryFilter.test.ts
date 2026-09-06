import { describe, expect, it } from 'vitest'

import {
  isFiltered,
  matchesFilter,
  nothingMatches,
  SHOWING_EVERYTHING,
  toggleArtist,
  toggleTag
} from './libraryFilter'

const song = (artist: string, tags: string[] = []) => ({ artist, tags })

describe('narrowing the library to an artist', () => {
  it('shows everything until something is asked for', () => {
    expect(isFiltered(SHOWING_EVERYTHING)).toBe(false)
    expect(matchesFilter(song('Anyone'), SHOWING_EVERYTHING)).toBe(true)
  })

  it('keeps only the songs by that artist', () => {
    const filter = toggleArtist(SHOWING_EVERYTHING, 'Radiohead')

    expect(matchesFilter(song('Radiohead'), filter)).toBe(true)
    expect(matchesFilter(song('Portishead'), filter)).toBe(false)
  })

  /* An artist is typed on each song separately, so the same one arrives spelled
     with different shouting; tags are matched the same way. */
  it('ignores case and stray spaces, as tags do', () => {
    const filter = toggleArtist(SHOWING_EVERYTHING, 'radiohead')

    expect(matchesFilter(song('Radiohead '), filter)).toBe(true)
  })

  it('stops when the same artist is asked for again', () => {
    const on = toggleArtist(SHOWING_EVERYTHING, 'Radiohead')

    expect(toggleArtist(on, 'Radiohead').artist).toBeNull()
    expect(toggleArtist(on, 'RADIOHEAD').artist).toBeNull()
  })

  /* Nothing has two artists, so adding rather than replacing could only ever
     empty the list. */
  it('swaps for another artist rather than asking for both', () => {
    const one = toggleArtist(SHOWING_EVERYTHING, 'Radiohead')

    expect(toggleArtist(one, 'Portishead').artist).toBe('Portishead')
  })

  it('leaves a song with no artist out of any artist', () => {
    const filter = toggleArtist(SHOWING_EVERYTHING, 'Radiohead')

    expect(matchesFilter(song(''), filter)).toBe(false)
  })
})

describe('an artist and tags together', () => {
  const both = toggleTag(toggleArtist(SHOWING_EVERYTHING, 'Radiohead'), 'gig')

  it('asks for both, not either', () => {
    expect(matchesFilter(song('Radiohead', ['gig']), both)).toBe(true)
    expect(matchesFilter(song('Radiohead', ['idea']), both)).toBe(false)
    expect(matchesFilter(song('Portishead', ['gig']), both)).toBe(false)
  })

  it('lets go of one without letting go of the other', () => {
    const left = toggleArtist(both, 'Radiohead')

    expect(left.artist).toBeNull()
    expect(left.tags).toEqual(['gig'])
  })

  it('says which of them found nothing', () => {
    expect(nothingMatches(SHOWING_EVERYTHING)).toBe('No song.')
    expect(nothingMatches(toggleArtist(SHOWING_EVERYTHING, 'Radiohead'))).toBe(
      'No song by Radiohead.'
    )
    expect(nothingMatches(toggleTag(SHOWING_EVERYTHING, 'gig'))).toBe(
      'No song has all of those tags.'
    )
    expect(nothingMatches(both)).toBe('No song by Radiohead has all of those tags.')
  })
})

describe('tags, as they behaved before', () => {
  it('accumulates rather than replacing', () => {
    const two = toggleTag(toggleTag(SHOWING_EVERYTHING, 'gig'), 'open D')

    expect(two.tags).toEqual(['gig', 'open D'])
    expect(matchesFilter(song('x', ['gig', 'open D']), two)).toBe(true)
    expect(matchesFilter(song('x', ['gig']), two)).toBe(false)
  })

  it('lets go of one that is asked for again, whatever its case', () => {
    const on = toggleTag(SHOWING_EVERYTHING, 'Open D')

    expect(toggleTag(on, 'open d').tags).toEqual([])
  })
})
