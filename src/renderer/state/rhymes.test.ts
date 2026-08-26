// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NO_RHYMES, type RhymeLookup, type Rhymes } from '@core/rhymes/rhymes'
import { installBridge } from '@renderer/testing/bridge'
import { useRhymes } from './rhymes'

const moan: Rhymes = { perfect: [{ word: 'moan', syllables: 1 }], near: [] }
const tone: Rhymes = { perfect: [{ word: 'tone', syllables: 1 }], near: [] }

const find = vi.fn(async () => ({ found: moan }) as RhymeLookup)

beforeEach(() => {
  installBridge()
  ;(window.rehearsal as unknown as Record<string, unknown>)['rhymes'] = { find }
  useRhymes.setState({ typed: '', found: '', rhymes: NO_RHYMES, looking: false, error: null })
})

afterEach(() => vi.clearAllMocks())

describe('looking up', () => {
  it('asks for the word as it would be written, not as it was typed', async () => {
    useRhymes.getState().type('  Alone, ')
    await useRhymes.getState().look()

    expect(find).toHaveBeenCalledWith('alone')
    expect(useRhymes.getState().found).toBe('alone')
  })

  it('does not ask about nothing', async () => {
    useRhymes.getState().type('   ')
    await useRhymes.getState().look()

    expect(find).not.toHaveBeenCalled()
  })

  it('keeps the message when the dictionary cannot be reached', async () => {
    find.mockResolvedValueOnce({ unreachable: 'Could not reach the rhyme dictionary.' })
    useRhymes.getState().type('alone')

    await useRhymes.getState().look()

    expect(useRhymes.getState().error).toMatch(/Could not reach/)
    expect(useRhymes.getState().rhymes).toEqual(NO_RHYMES)
    expect(useRhymes.getState().looking).toBe(false)
  })
})

/**
 * Rhymes come over the internet, so answers can arrive in any order. The one
 * that arrives last is not necessarily the one that was asked for last.
 */
describe('two lookups in flight', () => {
  it('shows the answer to the word asked about last', async () => {
    let releaseFirst: (lookup: RhymeLookup) => void = () => undefined
    find.mockReturnValueOnce(new Promise<RhymeLookup>((resolve) => (releaseFirst = resolve)))
    find.mockResolvedValueOnce({ found: tone })

    useRhymes.getState().type('alone')
    const first = useRhymes.getState().look()
    useRhymes.getState().type('stone')
    await useRhymes.getState().look()

    expect(useRhymes.getState().rhymes).toEqual(tone)

    releaseFirst({ found: moan })
    await first

    expect(useRhymes.getState().rhymes).toEqual(tone)
    expect(useRhymes.getState().found).toBe('stone')
  })

  it('does not let a stale failure wipe a good answer', async () => {
    let failFirst: (lookup: RhymeLookup) => void = () => undefined
    find.mockReturnValueOnce(new Promise<RhymeLookup>((resolve) => (failFirst = resolve)))
    find.mockResolvedValueOnce({ found: tone })

    useRhymes.getState().type('alone')
    const first = useRhymes.getState().look()
    useRhymes.getState().type('stone')
    await useRhymes.getState().look()

    failFirst({ unreachable: 'Could not reach the rhyme dictionary.' })
    await first

    expect(useRhymes.getState().error).toBeNull()
    expect(useRhymes.getState().rhymes).toEqual(tone)
  })
})
