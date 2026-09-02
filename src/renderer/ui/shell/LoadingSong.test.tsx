// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useSong } from '@renderer/state/song'
import { LoadingSong } from './LoadingSong'

afterEach(() => {
  cleanup()
  useSong.setState({ loading: null })
})

const fill = () => document.querySelector('.loading__fill') as HTMLElement | null

describe('what the app says while a song is being read in', () => {
  it('says nothing at all when nothing is loading', () => {
    useSong.setState({ loading: null })
    render(<LoadingSong />)

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says it is working before there is anything to count', () => {
    useSong.setState({ loading: { decoded: 0, total: 0 } })
    render(<LoadingSong />)

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText(/Reading it in/)).toBeTruthy()
    /* Nothing is known yet, so the bar does not pretend to a width. */
    expect(fill()?.dataset['measured']).toBe('false')
    expect(fill()?.style.width).toBe('')
  })

  it('counts the channels once it knows how many there are', () => {
    useSong.setState({ loading: { decoded: 3, total: 6 } })
    render(<LoadingSong />)

    expect(screen.getByText('3 of 6 channels')).toBeTruthy()
    expect(fill()?.style.width).toBe('50%')
    expect(fill()?.dataset['measured']).toBe('true')
  })

  /* The count is known but nothing has finished, so there is no length to
     draw and a flat empty bar would say the opposite of what is happening. */
  it('keeps sweeping until the first channel lands', () => {
    useSong.setState({ loading: { decoded: 0, total: 6 } })
    render(<LoadingSong />)

    expect(screen.getByText('0 of 6 channels')).toBeTruthy()
    expect(fill()?.dataset['measured']).toBe('false')
    expect(fill()?.style.width).toBe('')
  })

  it('fills up as the channels arrive', () => {
    useSong.setState({ loading: { decoded: 6, total: 6 } })
    render(<LoadingSong />)

    expect(fill()?.style.width).toBe('100%')
  })

  /* Read out rather than only drawn: the song was asked for and this is the
     answer to what happened next. */
  it('is announced', () => {
    useSong.setState({ loading: { decoded: 1, total: 2 } })
    render(<LoadingSong />)

    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
  })
})
