export interface Rhyme {
  word: string
  /** How many syllables it has, which is most of whether it will fit. */
  syllables: number
}

export interface Rhymes {
  /** Same vowel and same ending: stone, alone, known. */
  perfect: Rhyme[]
  /** Close enough to sing: control, although, bestow. */
  near: Rhyme[]
}

/**
 * Where rhymes come from.
 *
 * An interface because the one implementation is a web service, and a song
 * writer sitting on a train is entitled to a different answer than "no".
 */
export interface RhymeSource {
  find(word: string): Promise<Rhymes>
}

export const NO_RHYMES: Rhymes = { perfect: [], near: [] }

/**
 * What a lookup comes back with.
 *
 * Being offline is an outcome, not a fault: this is the one part of the app
 * that needs the internet, and a song writer on a train has simply not got it.
 * Thrown across the process boundary it would arrive wrapped in the name of
 * the method that failed, which is no use to anybody reading it.
 */
export type RhymeLookup = { found: Rhymes } | { unreachable: string }

/** As many as are worth reading before the list becomes a dictionary. */
export const RHYME_LIMIT = 40

/**
 * The word a lookup is for.
 *
 * Whatever was typed, less the punctuation and spacing that comes with copying
 * a word out of a line of lyrics. An apostrophe is kept, because it is part of
 * plenty of words worth rhyming.
 */
export function askedFor(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/^[^\p{L}']+|[^\p{L}']+$/gu, '')
}

interface RawRhyme {
  word?: unknown
  numSyllables?: unknown
}

/**
 * Reads what the service sent.
 *
 * Every field is checked: this is the one part of the app whose input comes
 * from somewhere nobody here controls, and a rhyme list is not worth a crash.
 */
export function parseRhymes(raw: unknown): Rhyme[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { word, numSyllables } = entry as RawRhyme
    if (typeof word !== 'string' || word.trim() === '') return []
    const syllables =
      typeof numSyllables === 'number' && Number.isFinite(numSyllables) && numSyllables > 0
        ? Math.round(numSyllables)
        : countSyllables(word)
    return [{ word, syllables }]
  })
}

/**
 * Puts the two lists together.
 *
 * A word the service returns as both a perfect rhyme and a near one is a
 * perfect rhyme; showing it twice would waste a line and imply a difference
 * that is not there.
 */
export function groupRhymes(
  perfect: Rhyme[],
  near: Rhyme[],
  limit = RHYME_LIMIT
): Rhymes {
  const kept = new Set<string>()
  const take = (rhymes: Rhyme[]): Rhyme[] => {
    const out: Rhyme[] = []
    for (const rhyme of rhymes) {
      const key = rhyme.word.toLowerCase()
      if (kept.has(key)) continue
      kept.add(key)
      out.push(rhyme)
      if (out.length === limit) break
    }
    return out
  }
  return { perfect: take(perfect), near: take(near) }
}

/**
 * A rough syllable count, for the rare entry that arrives without one.
 *
 * Vowel groups, less a silent final e. It is wrong often enough that it would
 * be no good as the only source, and right often enough to beat a blank.
 */
export function countSyllables(word: string): number {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '')
  if (letters === '') return 1
  const groups = letters.replace(/e$/, '').match(/[aeiouy]+/g)
  return Math.max(1, groups?.length ?? 1)
}
