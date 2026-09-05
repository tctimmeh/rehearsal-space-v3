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

  /* The same seven chords as the key above, which is the point of showing
     them: what changes is which one is home, and so what each is called. */
  it('counts the same seven chords again from the relative key', () => {
    render(<ChordChart />)

    expect(chipsUnder(/In A minor/)).toEqual([
      'Am i',
      'Bdim ii°',
      'C ♭III',
      'Dm iv',
      'Em v',
      'F ♭VI',
      'G ♭VII'
    ])
  })

  it('says nothing about how many sharps or flats the key carries', () => {
    useSong.setState({ song: inKey('Eb', 'major') })
    render(<ChordChart />)

    expect(screen.queryByText(/flats/)).toBeNull()
    expect(screen.queryByText(/relative/i)).toBeNull()
  })

  /* What borrowed and leading mean is something you know or look up once;
     printed under every heading it is a paragraph in the way of the chords. */
  it('names its groups and leaves them unexplained', () => {
    render(<ChordChart />)

    expect(document.querySelector('.chart__group-note')).toBeNull()
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

  it('offers what leads to each degree in a minor key, not an empty heading', () => {
    useSong.setState({ song: inKey('A', 'minor') })
    render(<ChordChart />)

    expect(chipsUnder(/Leading to each degree/)).toEqual(
      expect.arrayContaining(['G7 → C', 'A7 → Dm', 'C7 → F'])
    )
  })

  it('shows no group with nothing under it, in any key', () => {
    for (const [tonic, mode] of [
      ['C', 'major'],
      ['A', 'minor'],
      ['E♭', 'major'],
      ['F♯', 'minor']
    ] as const) {
      cleanup()
      useSong.setState({ song: inKey(tonic.replace('♭', 'b').replace('♯', '#'), mode) })
      render(<ChordChart />)

      for (const heading of document.querySelectorAll('.chart__group-name')) {
        const group = heading.parentElement as HTMLElement
        expect(group.querySelectorAll('.chart__chip').length, heading.textContent ?? '')
          .toBeGreaterThan(0)
      }
    }
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

    await user.selectOptions(screen.getByLabelText('Key'), 'G')

    await waitFor(() => expect(useSong.getState().song?.key).toEqual({ tonic: 'G', mode: 'major' }))
  })

  it('holds the pitch when the mode changes, and respells it if it must', async () => {
    const user = userEvent.setup()
    useSong.setState({ song: inKey('Eb', 'major') })
    render(<ChordChart />)

    await user.selectOptions(screen.getByLabelText('Mode'), 'minor')

    /* E flat minor, not D sharp minor: the same pitch, written as people write it. */
    await waitFor(() =>
      expect(useSong.getState().song?.key).toEqual({ tonic: 'Eb', mode: 'minor' })
    )
  })

  /* Twelve keys and two modes in a drawer as wide as a phone: two lists, not
     fourteen buttons taking the room the chords are meant to have. */
  it('offers the whole key as two lists rather than a wall of buttons', () => {
    render(<ChordChart />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByLabelText('Key').tagName).toBe('SELECT')
  })

  it('offers no key that nobody writes in', () => {
    render(<ChordChart />)
    const tonics = [...screen.getByLabelText('Key').children].map((one) => one.textContent)

    expect(tonics).toHaveLength(12)
    expect(tonics).toContain('E♭')
    expect(tonics).not.toContain('D♯')
  })
})
