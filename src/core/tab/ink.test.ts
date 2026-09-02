import { describe, expect, it } from 'vitest'

import { inkOf } from './ink'
import { parse } from './parse'
import { render } from './render'

describe('what a character is', () => {
  it('picks the frets out of the dashes holding them up', () => {
    expect(inkOf('|-12--x-|', 'string')).toEqual([
      'bar',
      'plain',
      'note',
      'note',
      'plain',
      'plain',
      'note',
      'plain',
      'bar'
    ])
  })

  it('reads a slide as part of the note it slides into', () => {
    expect(inkOf('-4/7-', 'string')).toEqual(['plain', 'note', 'note', 'note', 'plain'])
  })

  it('tells a beat from the sixteenths around it, and leaves the eighth alone', () => {
    expect(inkOf('1 e & a 2', 'beats')).toEqual([
      'beat',
      'plain',
      'sub',
      'plain',
      'plain',
      'plain',
      'sub',
      'plain',
      'beat'
    ])
  })

  it('does not mistake the digit in a chord name for a fret or a beat', () => {
    expect(inkOf('Am7', 'chord')).toEqual(['chord', 'chord', 'chord'])
  })
})

describe('over a real drawing', () => {
  const lines = render(parse('|-3-5-7-12-9---11---|')).replace(/\n$/, '').split('\n')

  it('finds the twelfth fret on the top string, both digits of it', () => {
    const top = lines.findIndex((line) => line.includes('12'))
    const drawn = lines[top] as string
    const inks = inkOf(drawn, 'string')
    const at = drawn.indexOf('12')
    expect([inks[at], inks[at + 1]]).toEqual(['note', 'note'])
  })
})
