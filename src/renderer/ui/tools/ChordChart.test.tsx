// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { newSong, type Song } from '@core/song/song'
import { useSong } from '@renderer/state/song'
import { installBridge } from '@renderer/testing/bridge'
import { ChordChart } from './ChordChart'

const inKey = (tonic: string, mode: 'major' | 'minor'): Song => ({
  ...newSong('a-song'),
  id: 'a-song',
  key: { tonic, mode }
})

beforeEach(() => {
  installBridge()
  useSong.setState({ song: inKey('C', 'major') })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/** The chips under one heading: their chord and the small note beside it. */
const chipsUnder = (heading: RegExp): string[] => {
  const group = screen.getByRole('heading', { name: heading }).parentElement as HTMLElement
  return [...group.querySelectorAll('.chart__chip')].map((chip) => {
    const chord = chip.firstChild?.textContent?.trim() ?? ''
    const note = chip.querySelector('.chart__chip-note')?.textContent?.trim() ?? ''
    return `${chord} ${note}`
  })
}

const degrees = () =>
  [...document.querySelectorAll('.chart__degree')].map((cell) => ({
    numeral: cell.querySelector('.chart__numeral')?.textContent,
    triad: cell.querySelector('.chart__triad')?.textContent
  }))

describe('the chart', () => {
  it('shows the seven chords of the song key', () => {
    render(<ChordChart />)

    expect(degrees().map((cell) => cell.triad)).toEqual([
      'C',
      'Dm',
      'Em',
      'F',
      'G',
      'Am',
      'Bdim'
    ])
  })

  it('says which degree each chord is, in the case that says major or minor', () => {
    render(<ChordChart />)

    expect(degrees().map((cell) => cell.numeral)).toEqual([
      'I',
      'ii',
      'iii',
      'IV',
      'V',
      'vi',
      'vii°'
    ])
  })

  it('writes accidentals as signs rather than as letters', () => {
    useSong.setState({ song: inKey('Eb', 'major') })
    render(<ChordChart />)

    expect(degrees().map((cell) => cell.triad)).toContain('E♭')
    expect(degrees().map((cell) => cell.triad)).toContain('A♭')
  })

  it('says what the key carries and what it is related to', () => {
    useSong.setState({ song: inKey('Eb', 'major') })
    render(<ChordChart />)

    expect(screen.getByText(/3 flats/)).toBeDefined()
    expect(screen.getByText(/relative C minor/)).toBeDefined()
  })

  it('offers what the parallel key has and this one does not', () => {
    render(<ChordChart />)

    expect(screen.getByRole('heading', { name: /Borrowed from C minor/ })).toBeDefined()
    expect(chipsUnder(/Borrowed from C minor/)).toEqual(
      expect.arrayContaining(['Cm i', 'Fm iv', 'A♭ ♭VI', 'B♭ ♭VII'])
    )
  })

  it('does not offer a chord the key already has', () => {
    render(<ChordChart />)

    const held = degrees().map((cell) => cell.triad)
    for (const chip of chipsUnder(/Borrowed from C minor/)) {
      expect(held).not.toContain(chip.split(' ')[0])
    }
  })

  it('offers the chord that leads to each degree, and where it leads', () => {
    render(<ChordChart />)

    expect(chipsUnder(/Leading to each degree/)).toEqual(
      expect.arrayContaining(['D7 → G', 'E7 → Am', 'A7 → Dm'])
    )
  })

  it('offers what harmonic minor adds, but only in a minor key', () => {
    render(<ChordChart />)
    expect(screen.queryByRole('heading', { name: /harmonic minor/i })).toBeNull()

    cleanup()
    useSong.setState({ song: inKey('A', 'minor') })
    render(<ChordChart />)
    expect(screen.getByRole('heading', { name: /From harmonic minor/ })).toBeDefined()
  })

  it('says so plainly when there is no song to be in a key', () => {
    useSong.setState({ song: null })
    render(<ChordChart />)

    expect(screen.getByText('No song loaded.')).toBeDefined()
  })
})

describe('choosing a key', () => {
  it('keeps the choice with the song', async () => {
    const user = userEvent.setup()
    render(<ChordChart />)

    await user.click(screen.getByRole('button', { name: 'G' }))

    await waitFor(() => expect(useSong.getState().song?.key).toEqual({ tonic: 'G', mode: 'major' }))
  })

  it('holds the pitch when the mode changes, and respells it if it must', async () => {
    const user = userEvent.setup()
    useSong.setState({ song: inKey('Eb', 'major') })
    render(<ChordChart />)

    await user.click(screen.getByRole('button', { name: 'Minor' }))

    /* E flat minor, not D sharp minor: the same pitch, written as people write it. */
    await waitFor(() =>
      expect(useSong.getState().song?.key).toEqual({ tonic: 'Eb', mode: 'minor' })
    )
  })

  it('offers no key that nobody writes in', () => {
    render(<ChordChart />)
    const tonics = [...document.querySelectorAll('.chart__tonic')].map((b) => b.textContent)

    expect(tonics).toHaveLength(12)
    expect(tonics).toContain('E♭')
    expect(tonics).not.toContain('D♯')
  })
})
