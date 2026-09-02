// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AudioChannel } from '@core/song/song'
import { keptPart } from '@core/song/trim'
import { TrimControls, TrimMarks } from './TrimMode'
import { installPointerCapture } from '@renderer/testing/pointer'
import type { View } from './waveformParts'

beforeEach(installPointerCapture)
afterEach(cleanup)

const take = (patch: Partial<AudioChannel> = {}): AudioChannel => ({
  id: 'c1',
  kind: 'audio',
  name: 'Take',
  subject: 'guitar',
  gain: 0,
  muted: false,
  soloed: false,
  file: 'audio/take.wav',
  startTime: 0,
  duration: 60,
  sourceDuration: 60,
  origin: { type: 'record' },
  ...patch
})

/* A window on the whole minute, one second to every ten pixels. */
const view: View = {
  from: 0,
  to: 60,
  timeAt: (clientX) => clientX / 10,
  xOf: (time) => `${(time / 60) * 100}%`,
  clock: (time) => `${time.toFixed(2)}s`
}

describe('trimming a take by looking at it', () => {
  it('cuts the front off where the handle is dragged to', () => {
    const onChange = vi.fn()
    render(<TrimMarks channel={take()} view={view} onChange={onChange} />)

    fireEvent.pointerDown(screen.getByRole('slider', { name: /Trim from/ }), { clientX: 100 })

    expect(keptPart(onChange.mock.calls[0]?.[0] as AudioChannel)).toEqual({ from: 10, to: 60 })
  })

  it('cuts the end off the same way', () => {
    const onChange = vi.fn()
    render(<TrimMarks channel={take()} view={view} onChange={onChange} />)

    fireEvent.pointerDown(screen.getByRole('slider', { name: /Trim to/ }), { clientX: 400 })

    expect(keptPart(onChange.mock.calls[0]?.[0] as AudioChannel)).toEqual({ from: 0, to: 40 })
  })

  /* The notes are where they are: cutting the front off must not drag what is
     left of it earlier. */
  it('leaves the music where it was when the front is cut', () => {
    const onChange = vi.fn()
    render(<TrimMarks channel={take({ startTime: 5 })} view={view} onChange={onChange} />)

    fireEvent.pointerDown(screen.getByRole('slider', { name: /Trim from/ }), { clientX: 150 })

    expect((onChange.mock.calls[0]?.[0] as AudioChannel).startTime).toBe(15)
  })

  it('moves the whole take by however far it is dragged', () => {
    const onChange = vi.fn()
    const channel = take({ startTime: 5 })
    render(<TrimMarks channel={channel} view={view} onChange={onChange} />)
    const body = screen.getByRole('slider', { name: /Starts at/ })

    fireEvent.pointerDown(body, { clientX: 200 })
    fireEvent.pointerMove(body, { clientX: 260 })

    const moved = onChange.mock.calls.at(-1)?.[0] as AudioChannel
    /* Six seconds along, from where it was — not to where the pointer is. */
    expect(moved.startTime).toBe(11)
    expect(keptPart(moved)).toEqual(keptPart(channel))
  })

  it('draws what has been cut off, so it can be seen', () => {
    const { container } = render(
      <TrimMarks
        channel={take({ offset: 10, duration: 30, sourceDuration: 60, startTime: 10 })}
        view={view}
        onChange={vi.fn()}
      />
    )

    expect(container.querySelectorAll('.align__cut')).toHaveLength(2)
  })

  it('draws none of it when nothing has been cut', () => {
    const { container } = render(<TrimMarks channel={take()} view={view} onChange={vi.fn()} />)

    expect(container.querySelectorAll('.align__cut')).toHaveLength(0)
  })
})

describe('what the trim controls say', () => {
  it('asks for a channel when there is none', () => {
    render(<TrimControls channel={null} view={view} onChange={vi.fn()} />)

    expect(screen.getByText(/Pick a channel/)).toBeTruthy()
  })

  it('offers to let it all back in once something has been cut', () => {
    const onChange = vi.fn()
    render(
      <TrimControls
        channel={take({ offset: 10, duration: 30, sourceDuration: 60, startTime: 10 })}
        view={view}
        onChange={onChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Keep all' }))

    const back = onChange.mock.calls[0]?.[0] as AudioChannel
    expect(keptPart(back)).toEqual({ from: 0, to: 60 })
    expect(back.startTime).toBe(0)
  })

  it('does not offer to when nothing has been', () => {
    render(<TrimControls channel={take()} view={view} onChange={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Keep all' })).toBeNull()
  })
})
