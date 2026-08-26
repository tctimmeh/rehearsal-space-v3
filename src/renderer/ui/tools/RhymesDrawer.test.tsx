// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NO_RHYMES, type RhymeLookup } from '@core/rhymes/rhymes'
import { lendCursor } from '@renderer/state/lyrics'
import { useRhymes } from '@renderer/state/rhymes'
import { installBridge } from '@renderer/testing/bridge'
import { RhymesDrawer } from './RhymesDrawer'

const found = {
  perfect: [
    { word: 'moan', syllables: 1 },
    { word: 'bemoan', syllables: 2 }
  ],
  near: [{ word: 'although', syllables: 2 }]
}

const find = vi.fn(async () => ({ found }) as RhymeLookup)

beforeEach(() => {
  installBridge()
  ;(window.rehearsal as unknown as Record<string, unknown>)['rhymes'] = { find }
  useRhymes.setState({ typed: '', found: '', rhymes: NO_RHYMES, looking: false, error: null })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const ask = async (user: ReturnType<typeof userEvent.setup>, word: string) => {
  await user.type(screen.getByRole('textbox', { name: 'Word' }), word)
  await user.click(screen.getByRole('button', { name: 'Find' }))
}

const words = () => [...document.querySelectorAll('.rhyme b')].map((word) => word.textContent)

describe('looking a word up', () => {
  it('asks for the word that was typed', async () => {
    const user = userEvent.setup()
    render(<RhymesDrawer />)

    await ask(user, 'alone')

    await waitFor(() => expect(find).toHaveBeenCalledWith('alone'))
  })

  it('shows the perfect rhymes and the near ones apart', async () => {
    const user = userEvent.setup()
    render(<RhymesDrawer />)

    await ask(user, 'alone')

    await waitFor(() => expect(words()).toEqual(['moan', 'bemoan', 'although']))
    expect(screen.getByText('Perfect')).toBeDefined()
    expect(screen.getByText('Near')).toBeDefined()
  })

  it('says how many syllables each one has, which is most of whether it fits', async () => {
    const user = userEvent.setup()
    render(<RhymesDrawer />)

    await ask(user, 'alone')

    await waitFor(() => expect(words()).toHaveLength(3))
    expect([...document.querySelectorAll('.rhyme span')].map((n) => n.textContent)).toEqual([
      '1',
      '2',
      '2'
    ])
  })

  it('says so when nothing rhymes, rather than showing an empty drawer', async () => {
    find.mockResolvedValueOnce({ found: NO_RHYMES })
    const user = userEvent.setup()
    render(<RhymesDrawer />)

    await ask(user, 'orange')

    await waitFor(() => expect(screen.getByText(/Nothing rhymes with/)).toBeDefined())
  })

  it('asks for nothing when nothing was typed', async () => {
    const user = userEvent.setup()
    render(<RhymesDrawer />)

    await user.click(screen.getByRole('button', { name: 'Find' }))

    expect(find).not.toHaveBeenCalled()
  })
})

/** The one part of the app that needs the internet, so it must fail clearly. */
describe('when the dictionary cannot be reached', () => {
  it('says what went wrong instead of looking empty', async () => {
    find.mockResolvedValueOnce({ unreachable: 'Could not reach the rhyme dictionary.' })
    const user = userEvent.setup()
    render(<RhymesDrawer />)

    await ask(user, 'alone')

    await waitFor(() => expect(screen.getByText(/Could not reach/)).toBeDefined())
  })

  it('lets the next attempt work', async () => {
    find.mockResolvedValueOnce({ unreachable: 'Could not reach the rhyme dictionary.' })
    const user = userEvent.setup()
    render(<RhymesDrawer />)
    await ask(user, 'alone')
    await waitFor(() => expect(screen.getByText(/Could not reach/)).toBeDefined())

    await user.click(screen.getByRole('button', { name: 'Find' }))

    await waitFor(() => expect(words()).toEqual(['moan', 'bemoan', 'although']))
    expect(screen.queryByText(/Could not reach/)).toBeNull()
  })
})

describe('putting a word in a line', () => {
  it('writes it where the cursor is when the editor is open', async () => {
    const written: string[] = []
    const drop = lendCursor((word) => written.push(word))
    const user = userEvent.setup()
    render(<RhymesDrawer />)
    await ask(user, 'alone')
    await waitFor(() => expect(words()).toHaveLength(3))

    await user.click(screen.getByRole('button', { name: /bemoan/ }))

    expect(written).toEqual(['bemoan'])
    drop()
  })

  it('says where the words would go when no editor is open', async () => {
    const user = userEvent.setup()
    render(<RhymesDrawer />)

    await ask(user, 'alone')

    await waitFor(() =>
      expect(screen.getByText(/Open the lyrics editor to put one in a line/)).toBeDefined()
    )
  })
})
