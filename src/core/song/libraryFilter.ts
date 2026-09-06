import { matchesTags } from './tags'

/**
 * What the library is narrowed to.
 *
 * Two kinds of narrowing, and they are not the same kind of thing. Tags
 * accumulate — picking a second one asks for the songs that are both — while
 * an artist replaces: a song has one artist, so asking for two at once would
 * always come back empty.
 */
export interface LibraryFilter {
  tags: string[]
  /** Null when every artist is shown. */
  artist: string | null
}

export const SHOWING_EVERYTHING: LibraryFilter = { tags: [], artist: null }

export const isFiltered = (filter: LibraryFilter): boolean =>
  filter.tags.length > 0 || filter.artist !== null

/** As tags are matched: their own spelling kept, their shouting ignored. */
export const sameArtist = (one: string, other: string): boolean =>
  one.trim().toLocaleLowerCase() === other.trim().toLocaleLowerCase()

export const matchesFilter = (
  song: { artist: string; tags: string[] },
  filter: LibraryFilter
): boolean =>
  matchesTags(song.tags, filter.tags) &&
  (filter.artist === null || sameArtist(song.artist, filter.artist))

/**
 * Asking for a tag, and asking for it again to stop.
 */
export function toggleTag(filter: LibraryFilter, tag: string): LibraryFilter {
  const held = filter.tags.some((one) => one.toLocaleLowerCase() === tag.toLocaleLowerCase())
  return {
    ...filter,
    tags: held
      ? filter.tags.filter((one) => one.toLocaleLowerCase() !== tag.toLocaleLowerCase())
      : [...filter.tags, tag]
  }
}

/**
 * Asking for an artist, and asking for the same one again to stop.
 *
 * Clicking a second artist swaps rather than adding, which is the only reading
 * that can return anything: nothing has two artists.
 */
export function toggleArtist(filter: LibraryFilter, artist: string): LibraryFilter {
  const already = filter.artist !== null && sameArtist(filter.artist, artist)
  return { ...filter, artist: already ? null : artist }
}

/** Why the list is empty, in the words of whatever was asked for. */
export function nothingMatches(filter: LibraryFilter): string {
  const byArtist = filter.artist === null ? '' : ` by ${filter.artist}`
  if (filter.tags.length === 0) return `No song${byArtist}.`
  return `No song${byArtist} has all of those tags.`
}
