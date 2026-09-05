// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { engagedThemeOf } from '@core/ui/accents'
import { followEngagedColor } from './appearance'
import { useConfig } from './config'

const held = (name: string): string =>
  document.documentElement.style.getPropertyValue(name)

let stop: (() => void) | null = null

afterEach(() => {
  stop?.()
  stop = null
  document.documentElement.removeAttribute('style')
  useConfig.setState({ config: null })
})

describe('the colour a latched control is lit with', () => {
  it('is on the document before anything has been read', () => {
    stop = followEngagedColor()

    expect(held('--engaged')).toBe(engagedThemeOf('teal').color)
  })

  it('follows the setting, rim and glow along with it', () => {
    stop = followEngagedColor()

    useConfig.setState({ config: { engagedColor: 'amber' } as never })

    const amber = engagedThemeOf('amber')
    expect(held('--engaged')).toBe(amber.color)
    expect(held('--engaged-rim')).toBe(amber.rim)
    expect(held('--engaged-glow')).toBe(amber.glow)
  })

  /* A config file naming a colour that no longer exists must not leave the
     app with an empty custom property, which would resolve to nothing. */
  it('falls back rather than emptying the property', () => {
    useConfig.setState({ config: { engagedColor: 'chartreuse' } as never })

    stop = followEngagedColor()

    expect(held('--engaged')).toBe(engagedThemeOf('teal').color)
  })

  it('stops following once it is let go', () => {
    stop = followEngagedColor()
    stop()
    stop = null

    useConfig.setState({ config: { engagedColor: 'violet' } as never })

    expect(held('--engaged')).toBe(engagedThemeOf('teal').color)
  })
})
