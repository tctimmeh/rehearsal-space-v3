// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { BINDING_COUNT } from '@core/keys/hotkeys'
import { ShortcutsModal } from './ShortcutsModal'

afterEach(cleanup)

describe('the list of shortcuts', () => {
  it('shows every key the app answers to', () => {
    render(<ShortcutsModal onDismiss={() => undefined} />)

    /* Every binding, and Escape, which belongs to whatever is on screen. */
    expect(screen.getAllByRole('term')).toHaveLength(BINDING_COUNT + 1)
  })

  it('says what they do rather than naming the machinery', () => {
    render(<ShortcutsModal onDismiss={() => undefined} />)

    expect(screen.getByText('Play or pause')).toBeTruthy()
    expect(screen.getByText('Arm recording and play')).toBeTruthy()
  })

  it('groups them by what they are for', () => {
    render(<ShortcutsModal onDismiss={() => undefined} />)

    expect(screen.getByRole('heading', { name: 'Playing' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Recording' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Tools' })).toBeTruthy()
  })
})
