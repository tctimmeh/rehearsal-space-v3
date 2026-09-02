// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSong } from './state/song'
import { useView } from './state/view'
import { installBridge } from './testing/bridge'
import { installResizeObserver } from './testing/resize'
import { App } from './App'

beforeEach(() => {
  installBridge()
  installResizeObserver()
  window.rehearsal.library.list = vi.fn(async () => [])
  window.rehearsal.config.get = vi.fn(async () => ({ lastSongId: null }) as never)
})

afterEach(() => {
  cleanup()
  useSong.setState({ song: null, loading: null })
  useView.setState({ view: 'player' })
  vi.clearAllMocks()
})

/*
 * A song is often opened from the library, and the player is not on screen
 * until it has finished loading — so an indicator living inside the player is
 * one that nobody waiting for a song ever sees. It belongs to the app.
 */
describe('the loading indicator, whichever view is up', () => {
  it('shows while a song loads from the library', () => {
    useView.setState({ view: 'library' })
    useSong.setState({ loading: { decoded: 2, total: 5 } })

    render(<App />)

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText('2 of 5 channels')).toBeTruthy()
  })

  it('shows while a song loads on the player', () => {
    useView.setState({ view: 'player' })
    useSong.setState({ loading: { decoded: 2, total: 5 } })

    render(<App />)

    expect(screen.getByText('2 of 5 channels')).toBeTruthy()
  })

  it('is out of the way when nothing is loading', () => {
    useView.setState({ view: 'library' })
    useSong.setState({ loading: null })

    render(<App />)

    expect(screen.queryByRole('status')).toBeNull()
  })
})
