import {
  askedFor,
  groupRhymes,
  NO_RHYMES,
  parseRhymes,
  RHYME_LIMIT,
  type RhymeLookup,
  type Rhymes,
  type RhymeSource
} from '@core/rhymes/rhymes'

const ENDPOINT = 'https://api.datamuse.com/words'
/** Long enough for a slow train, short enough to stop looking hung. */
const TIMEOUT_MS = 6000

export class RhymesUnreachableError extends Error {
  constructor() {
    super('Could not reach the rhyme dictionary. It needs the internet.')
  }
}

/**
 * Rhymes from Datamuse.
 *
 * Asked for from here rather than from the page, so the window keeps a content
 * policy that lets it talk to nothing at all. The service is free, needs no
 * key, and is the only part of this app that requires the internet — so the
 * one thing it must do well is fail clearly.
 */
export class DatamuseRhymes implements RhymeSource {
  async find(word: string): Promise<Rhymes> {
    const wanted = askedFor(word)
    if (wanted === '') return NO_RHYMES

    const [perfect, near] = await Promise.all([
      this.ask('rel_rhy', wanted),
      this.ask('rel_nry', wanted)
    ])
    return groupRhymes(parseRhymes(perfect), parseRhymes(near), RHYME_LIMIT)
  }

  private async ask(relation: string, word: string): Promise<unknown> {
    const url = `${ENDPOINT}?${relation}=${encodeURIComponent(word)}&max=${RHYME_LIMIT}`
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!response.ok) throw new RhymesUnreachableError()
      return await response.json()
    } catch (error) {
      if (error instanceof RhymesUnreachableError) throw error
      /* No network, DNS, timeout, or something that was not JSON. */
      throw new RhymesUnreachableError()
    }
  }
}

export const rhymeSource: RhymeSource = new DatamuseRhymes()

/** The lookup as the window sees it: an answer, or a reason there is none. */
export async function lookUpRhymes(word: string): Promise<RhymeLookup> {
  try {
    return { found: await rhymeSource.find(word) }
  } catch (error) {
    return {
      unreachable: error instanceof Error ? error.message : new RhymesUnreachableError().message
    }
  }
}
