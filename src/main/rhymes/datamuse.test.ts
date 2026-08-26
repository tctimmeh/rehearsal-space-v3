import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { lookUpRhymes } from './datamuse'

const answering = (perfect: unknown, near: unknown) =>
  vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.includes('rel_rhy') ? perfect : near)
  })) as unknown as typeof fetch

beforeEach(() => {
  vi.stubGlobal('fetch', answering([{ word: 'moan', numSyllables: 1 }], [{ word: 'although', numSyllables: 2 }]))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('looking rhymes up', () => {
  it('asks for perfect and near rhymes, and keeps them apart', async () => {
    const lookup = await lookUpRhymes('alone')

    expect(lookup).toEqual({
      found: {
        perfect: [{ word: 'moan', syllables: 1 }],
        near: [{ word: 'although', syllables: 2 }]
      }
    })
  })

  it('asks about the word, not about the punctuation around it', async () => {
    await lookUpRhymes('  Alone, ')

    const asked = vi.mocked(fetch).mock.calls.map(([url]) => String(url))
    expect(asked.every((url) => url.includes('=alone&'))).toBe(true)
  })

  it('asks nothing at all about nothing', async () => {
    const lookup = await lookUpRhymes('   ')

    expect(lookup).toEqual({ found: { perfect: [], near: [] } })
    expect(fetch).not.toHaveBeenCalled()
  })
})

/**
 * The one part of the app that needs the internet. Thrown across the process
 * boundary this would arrive wrapped in the name of the method that failed,
 * so it comes back as an outcome instead.
 */
describe('when the dictionary cannot be reached', () => {
  it('says so in words worth reading', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND api.datamuse.com')
    }))

    const lookup = await lookUpRhymes('alone')

    expect(lookup).toEqual({ unreachable: expect.stringContaining('needs the internet') })
    expect(JSON.stringify(lookup)).not.toContain('ENOTFOUND')
  })

  it('treats a bad reply as being unreachable rather than as an empty answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })))

    expect(await lookUpRhymes('alone')).toEqual({
      unreachable: expect.stringContaining('needs the internet')
    })
  })

  it('survives a reply that is not the JSON it asked for', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON')
      }
    })))

    expect(await lookUpRhymes('alone')).toEqual({
      unreachable: expect.stringContaining('needs the internet')
    })
  })
})
