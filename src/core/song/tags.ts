/**
 * Tags are the user's own words for what a song is: "gig", "half finished",
 * "open D". They are typed rather than chosen from a list, so the rules here
 * are mostly about not ending up with two of the same tag spelled differently.
 */

/** Long enough for a phrase, short enough to sit in a row. */
export const TAG_MAX_LENGTH = 32
/** More than this on one song and the column is unreadable anyway. */
export const TAGS_PER_SONG = 20

/**
 * A tag as it will be stored: the spacing tidied and nothing else.
 *
 * The case is left as it was typed, because it is the user's own word and
 * "Open D" is how they wrote it. Matching ignores case, so it cannot produce a
 * second tag that differs only in shouting.
 */
export function normaliseTag(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, TAG_MAX_LENGTH)
}

export const sameTag = (one: string, other: string): boolean =>
  one.toLocaleLowerCase() === other.toLocaleLowerCase()

const byName = (one: string, other: string): number =>
  one.toLocaleLowerCase().localeCompare(other.toLocaleLowerCase())

/** Kept in order, so a song's tags do not shuffle when one is added. */
export function addTag(tags: readonly string[], text: string): string[] {
  const tag = normaliseTag(text)
  if (tag === '') return [...tags]
  if (tags.some((held) => sameTag(held, tag))) return [...tags]
  if (tags.length >= TAGS_PER_SONG) return [...tags]
  return [...tags, tag].sort(byName)
}

export function removeTag(tags: readonly string[], text: string): string[] {
  return tags.filter((held) => !sameTag(held, text))
}

export const hasTag = (tags: readonly string[], text: string): boolean =>
  tags.some((held) => sameTag(held, text))

/** Every tag in use anywhere, for offering what other songs already say. */
export function knownTags(songs: readonly { tags: string[] }[]): string[] {
  const seen = new Map<string, string>()
  for (const song of songs) {
    for (const tag of song.tags) {
      const key = tag.toLocaleLowerCase()
      if (!seen.has(key)) seen.set(key, tag)
    }
  }
  return [...seen.values()].sort(byName)
}

/**
 * What to offer while a tag is being typed.
 *
 * Tags already on the song are left out — there is nothing to be gained by
 * offering one that is already there — and what matches the start comes before
 * what merely contains it, since that is what typing usually means.
 */
export function suggestTags(
  known: readonly string[],
  typed: string,
  alreadyOn: readonly string[]
): string[] {
  const query = normaliseTag(typed).toLocaleLowerCase()
  const free = known.filter((tag) => !hasTag(alreadyOn, tag))
  if (query === '') return free

  const starts = free.filter((tag) => tag.toLocaleLowerCase().startsWith(query))
  const contains = free.filter(
    (tag) => !tag.toLocaleLowerCase().startsWith(query) && tag.toLocaleLowerCase().includes(query)
  )
  return [...starts, ...contains]
}

/**
 * Whether a song belongs in the library as filtered.
 *
 * Every chosen tag has to be on it. Choosing two narrows to the songs that are
 * both, which is what picking a second one is for; the other reading would
 * widen the list and there is already a way to see everything.
 */
export function matchesTags(tags: readonly string[], filter: readonly string[]): boolean {
  return filter.every((wanted) => hasTag(tags, wanted))
}

/** Reading tags off a song file, which is editable by hand. */
export function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const tags: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const tag = normaliseTag(entry)
    if (tag === '' || tags.some((held) => sameTag(held, tag))) continue
    tags.push(tag)
    if (tags.length === TAGS_PER_SONG) break
  }
  return tags.sort(byName)
}
