// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { noteFromFrequency } from '@core/music/note'
import { useTuner } from '@renderer/state/tuner'
import { TunerGadget } from './TunerGadget'

const listening = vi.hoisted(() => ({ starts: 0, stops: 0 }))

vi.mock('@renderer/state/tuner', async () => {
  const { create } = await import('zustand')
  const useTuner = create(() => ({
    status: 'listening' as 'off' | 'listening' | 'deaf',
    note: null as ReturnType<typeof import('@core/music/note').noteFromFrequency>,
    frequency: null as number | null,
    fading: false,
    level: 0
  }))
  return {
    useTuner,
    startListening: async () => {
      listening.starts += 1
    },
    stopListening: () => {
      listening.stops += 1
    }
  }
})

const hearing = (hz: number, fading = false) =>
  useTuner.setState({ note: noteFromFrequency(hz), frequency: hz, fading, status: 'listening' })

beforeEach(() => {
  listening.starts = 0
  listening.stops = 0
  useTuner.setState({ status: 'listening', note: null, frequency: null, fading: false })
})

afterEach(cleanup)

const needle = () => document.querySelector('.cents__needle') as HTMLElement | null
const noteBox = () => document.querySelector('.tuner__note') as HTMLElement

describe('the tuner display', () => {
  it('listens for as long as it is on screen', () => {
    const view = render(<TunerGadget />)
    expect(listening.starts).toBe(1)

    view.unmount()
    expect(listening.stops).toBe(1)
  })

  it('names the note and how far off it is', () => {
    hearing(445)
    render(<TunerGadget />)

    expect(noteBox().textContent).toBe('A4')
    expect(screen.getByText('+19.6 cents')).toBeDefined()
  })

  it('says it is listening rather than showing a note it has not heard', () => {
    render(<TunerGadget />)

    expect(noteBox().textContent).toBe('—')
    expect(screen.getByText('listening…')).toBeDefined()
    expect(needle()).toBeNull()
  })

  it('marks a note that is in tune', () => {
    hearing(440.5)
    render(<TunerGadget />)

    expect(noteBox().dataset['tuned']).toBe('true')
    expect(needle()?.dataset['tuned']).toBe('true')
  })

  it('does not call a note in tune while it is only a memory', () => {
    hearing(440.5, true)
    render(<TunerGadget />)

    expect(noteBox().dataset['tuned']).toBe('false')
  })

  it('puts the needle where the note is, flat to the left', () => {
    hearing(435)
    render(<TunerGadget />)

    expect(Number.parseFloat(needle()?.style.left ?? '0')).toBeCloseTo(30.2, 0)
  })

  it('keeps the needle on the meter for a note that is wildly off', () => {
    /* Nothing is further than half a semitone: another note would be nearer. */
    hearing(452)
    render(<TunerGadget />)

    const left = Number.parseFloat(needle()?.style.left ?? '0')
    expect(left).toBeGreaterThanOrEqual(0)
    expect(left).toBeLessThanOrEqual(100)
  })

  it('says when there is no input to listen to', () => {
    useTuner.setState({ status: 'deaf' })
    render(<TunerGadget />)

    expect(screen.getByText('no input')).toBeDefined()
  })
})
