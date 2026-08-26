// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TagInput } from './TagInput'

const LIST_HEIGHT = 200
const FIELD_HEIGHT = 22

/**
 * There is no layout in jsdom, so the field and the list are told where they
 * are. Everything the placement decides follows from those two rectangles.
 */
const placeFieldAt = (top: number, left = 100) => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const isField = this.classList.contains('tag-input')
    const height = isField ? FIELD_HEIGHT : LIST_HEIGHT
    const at = isField ? top : 0
    return {
      top: at,
      bottom: at + height,
      left: isField ? left : 0,
      right: left + 120,
      width: 120,
      height,
      x: left,
      y: at,
      toJSON: () => ({})
    } as DOMRect
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return (this as HTMLElement).classList.contains('tag-suggestions') ? LIST_HEIGHT : FIELD_HEIGHT
    }
  })
}

const show = () =>
  render(
    <TagInput
      known={['covers', 'gig', 'open D']}
      alreadyOn={[]}
      onAdd={() => undefined}
      onDone={() => undefined}
    />
  )

const list = () => document.querySelector('.tag-suggestions') as HTMLElement

beforeEach(() => {
  /* jsdom's window is 768 tall. */
  window.innerWidth = 1024
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('where the suggestions go', () => {
  it('sits under the field when there is room', () => {
    placeFieldAt(100)
    show()

    expect(Number.parseFloat(list().style.top)).toBe(100 + FIELD_HEIGHT + 4)
  })

  /* A song at the foot of the window had its suggestions drawn past the
     bottom edge, where they could be seen but not reached. */
  it('sits above the field when there is not', () => {
    placeFieldAt(700)
    show()

    const top = Number.parseFloat(list().style.top)
    expect(top).toBeLessThan(700)
    expect(top + LIST_HEIGHT).toBeLessThanOrEqual(window.innerHeight)
  })

  it('stays on the page even when there is room nowhere', () => {
    window.innerHeight = 150
    placeFieldAt(120)
    show()

    expect(Number.parseFloat(list().style.top)).toBeGreaterThanOrEqual(0)
    window.innerHeight = 768
  })

  it('does not run off the right edge', () => {
    placeFieldAt(100, 980)
    show()

    const left = Number.parseFloat(list().style.left)
    expect(left + 190).toBeLessThanOrEqual(window.innerWidth)
  })

  it('offers what other songs use', () => {
    placeFieldAt(100)
    show()

    expect(screen.getByRole('option', { name: 'gig' })).toBeTruthy()
  })
})
