// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AudioChannel } from '@core/song/song'
import { ChannelEditor } from './ChannelEditor'

afterEach(cleanup)

const channel = (): AudioChannel => ({
  id: 'c1',
  kind: 'audio',
  name: 'Audio 1',
  subject: 'guitar',
  gain: 0,
  muted: false,
  soloed: false,
  file: 'audio/take.wav',
  startTime: 0,
  duration: 60,
  origin: { type: 'record' }
})

const show = (onChange = vi.fn(), onDone = vi.fn()) => {
  render(<ChannelEditor channel={channel()} onChange={onChange} onDone={onDone} />)
  return { onChange, onDone, name: () => screen.getByLabelText('Name') as HTMLInputElement }
}

/*
 * The name a channel arrives with is whatever the recorder or the file called
 * it, which is exactly why the dialog is being opened.
 */
describe('the channel name', () => {
  it('is picked out ready to be typed over', () => {
    const { name } = show()

    expect(document.activeElement).toBe(name())
    expect(name().selectionStart).toBe(0)
    expect(name().selectionEnd).toBe('Audio 1'.length)
  })

  it('is replaced by what is typed rather than added to', async () => {
    const user = userEvent.setup()
    const { onChange } = show()

    await user.keyboard('R')

    expect(onChange).toHaveBeenCalledWith({ name: 'R' })
  })

  /* It saves as it is typed, so Enter has nothing left to mean but done. */
  it('closes the dialog on Enter', async () => {
    const user = userEvent.setup()
    const { onDone } = show()

    await user.keyboard('{Enter}')

    expect(onDone).toHaveBeenCalled()
  })

  it('does not close on any other key', async () => {
    const user = userEvent.setup()
    const { onDone } = show()

    await user.keyboard('x')

    expect(onDone).not.toHaveBeenCalled()
  })
})
