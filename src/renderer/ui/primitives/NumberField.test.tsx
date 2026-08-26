// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NumberField } from './NumberField'
import { installPointerCapture } from '@renderer/testing/pointer'

const show = (props: Partial<Parameters<typeof NumberField>[0]> = {}) => {
  const onChange = vi.fn()
  render(<NumberField label="Beats" value={4} min={1} max={16} onChange={onChange} {...props} />)
  return onChange
}

beforeEach(installPointerCapture)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

/**
 * The browser's own arrows are a light grey it will not let anybody change, so
 * these are ours. Which means they have to work like arrows.
 */
describe('the stepper', () => {
  it('steps up and down', async () => {
    const user = userEvent.setup()
    const onChange = show()

    await user.click(screen.getByRole('button', { name: 'Beats up' }))
    expect(onChange).toHaveBeenLastCalledWith(5)

    await user.click(screen.getByRole('button', { name: 'Beats down' }))
    expect(onChange).toHaveBeenLastCalledWith(3)
  })

  it('steps by the step it was given', async () => {
    const user = userEvent.setup()
    const onChange = show({ value: 100, step: 5, max: 400 })

    await user.click(screen.getByRole('button', { name: 'Beats up' }))

    expect(onChange).toHaveBeenLastCalledWith(105)
  })

  it('will not step past the ends', () => {
    show({ value: 16 })

    expect(screen.getByRole('button', { name: 'Beats up' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Beats down' })).toHaveProperty('disabled', false)
  })

  it('keeps going while held', async () => {
    vi.useFakeTimers()
    const onChange = show()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Beats up' }), { button: 0 })
    await act(async () => {
      vi.advanceTimersByTime(420 + 110 * 3)
    })

    expect(onChange.mock.calls.length).toBeGreaterThan(2)
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Beats up' }))
  })
})

describe('typing into it', () => {
  it('takes what was typed', () => {
    const onChange = show()

    fireEvent.change(screen.getByLabelText('Beats'), { target: { value: '7' } })

    expect(onChange).toHaveBeenLastCalledWith(7)
  })

  it('holds a number to the ends it was given', () => {
    const onChange = show()

    fireEvent.change(screen.getByLabelText('Beats'), { target: { value: '900' } })

    expect(onChange).toHaveBeenLastCalledWith(16)
  })

  it('treats an emptied field as on the way somewhere, not as nothing', () => {
    const onChange = show()

    fireEvent.change(screen.getByLabelText('Beats'), { target: { value: '' } })

    expect(onChange).not.toHaveBeenCalled()
  })
})
