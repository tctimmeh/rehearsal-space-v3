// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installBridge } from '@renderer/testing/bridge'
import { AboutModal } from './AboutModal'

beforeEach(installBridge)
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('what the app says about itself', () => {
  it('gives its name and what it is for', () => {
    render(<AboutModal onDismiss={() => undefined} />)

    expect(screen.getByText('Rehearsal Space')).toBeTruthy()
    expect(screen.getByText(/music practice and song-writing/)).toBeTruthy()
  })

  /* Whatever the running app was packaged as, rather than a number compiled
     into the page that can disagree with it. */
  it('asks the app itself which version it is', async () => {
    render(<AboutModal onDismiss={() => undefined} />)

    await waitFor(() => expect(screen.getByText('0.2.0')).toBeTruthy())
    expect(window.rehearsal.app.version).toHaveBeenCalled()
  })

  it('shows where the source is', async () => {
    render(<AboutModal onDismiss={() => undefined} />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /github\.com/ })).toBeTruthy()
    )
  })

  /* Following a link inside the window would replace the app with a web page,
     so it is handed to the desktop instead. */
  it('opens the source in the desktop browser rather than in the app', async () => {
    const user = userEvent.setup()
    render(<AboutModal onDismiss={() => undefined} />)
    const link = await screen.findByRole('button', { name: /github\.com/ })

    await user.click(link)

    expect(window.rehearsal.app.openLink).toHaveBeenCalledWith(
      'https://github.com/tctimmeh/rehearsal-space-v3'
    )
  })

  it('closes when it is done with', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<AboutModal onDismiss={onDismiss} />)

    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(onDismiss).toHaveBeenCalled()
  })
})
