// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DemucsInstallDialog } from './DemucsInstallDialog'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const show = (over: Partial<Parameters<typeof DemucsInstallDialog>[0]> = {}) => {
  const onInstall = vi.fn()
  const onDismiss = vi.fn()
  render(
    <DemucsInstallDialog
      whyNot={null}
      installing={false}
      onInstall={onInstall}
      onDismiss={onDismiss}
      {...over}
    />
  )
  return { onInstall, onDismiss }
}

describe('asking before demucs is installed', () => {
  /* A gigabyte is not something to take from somebody quietly. */
  it('says what it will cost before anything is fetched', () => {
    show()

    expect(document.body.textContent).toMatch(/450 MB/)
    expect(document.body.textContent).toMatch(/1\.3 GB/)
  })

  it('installs it when asked to', async () => {
    const user = userEvent.setup()
    const { onInstall } = show()

    await user.click(screen.getByRole('button', { name: 'Install it' }))

    expect(onInstall).toHaveBeenCalledOnce()
  })

  it('fetches nothing when it is turned down', async () => {
    const user = userEvent.setup()
    const { onInstall, onDismiss } = show()

    await user.click(screen.getByRole('button', { name: 'Not now' }))

    expect(onDismiss).toHaveBeenCalledOnce()
    expect(onInstall).not.toHaveBeenCalled()
  })

  it('says so while it is already going on', () => {
    show({ installing: true })

    expect(screen.getByRole('button', { name: 'Installing…' })).toHaveProperty('disabled', true)
  })

  /*
   * Three machines have the parts published for them and no others. Offering
   * a button that cannot work would be worse than saying why.
   */
  it('explains instead of offering, where the machine cannot have it', () => {
    show({ whyNot: 'sphn publishes no build for linux arm64.' })

    expect(screen.queryByRole('button', { name: 'Install it' })).toBeNull()
    expect(document.body.textContent).toContain('sphn publishes no build')
    expect(document.body.textContent).toMatch(/Choose/)
  })
})
