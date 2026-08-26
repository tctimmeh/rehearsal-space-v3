// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StemsDialog } from './StemsDialog'

const separate = vi.fn()

const show = () =>
  render(<StemsDialog busy={false} onSeparate={separate} onDismiss={() => undefined} />)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const boxes = () =>
  [...document.querySelectorAll('.checks .check')].map((box) => ({
    stem: box.textContent ?? '',
    ticked: (box as HTMLElement).dataset['engaged'] === 'true'
  }))

const stems = () => boxes().map((box) => box.stem)
const unticked = () => boxes().filter((box) => !box.ticked).map((box) => box.stem)

describe('choosing what to extract', () => {
  it('offers every part of the six-stem model, all ticked', () => {
    show()

    expect(stems()).toEqual(['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'])
    expect(unticked()).toEqual([])
  })

  it('offers every part of the four-stem model, all ticked', async () => {
    const user = userEvent.setup()
    show()

    await user.click(screen.getByRole('button', { name: 'Four stems' }))

    expect(stems()).toEqual(['vocals', 'drums', 'bass', 'other'])
    expect(unticked()).toEqual([])
  })

  /**
   * The four-stem model has no guitar and no piano. Keeping the ticks across a
   * change left both unticked on the way back, with nothing saying why.
   */
  it('ticks everything again on the way back to six', async () => {
    const user = userEvent.setup()
    show()

    await user.click(screen.getByRole('button', { name: 'Four stems' }))
    await user.click(screen.getByRole('button', { name: 'Six stems' }))

    expect(unticked()).toEqual([])
  })

  it('forgets what was unticked when the model changes', async () => {
    const user = userEvent.setup()
    show()

    await user.click(screen.getByRole('button', { name: 'vocals' }))
    expect(unticked()).toEqual(['vocals'])

    await user.click(screen.getByRole('button', { name: 'Four stems' }))

    expect(unticked()).toEqual([])
  })

  it('separates only what is still ticked', async () => {
    const user = userEvent.setup()
    show()

    await user.click(screen.getByRole('button', { name: 'piano' }))
    await user.click(screen.getByRole('button', { name: 'Separate' }))

    expect(separate).toHaveBeenCalledWith(
      'htdemucs_6s',
      ['vocals', 'drums', 'bass', 'guitar', 'other'],
      true
    )
  })

  it('mutes the channel it came from unless told otherwise', async () => {
    const user = userEvent.setup()
    show()

    await user.click(screen.getByRole('button', { name: 'Mute this channel' }))
    await user.click(screen.getByRole('button', { name: 'Separate' }))

    expect(separate).toHaveBeenCalledWith('htdemucs_6s', expect.any(Array), false)
  })
})
