import { describe, expect, it } from 'vitest'

import { inkOf, rowsOf } from './ink'
import { parse } from './parse'
import { render } from './render'

describe('which row is which', () => {
  it('reads the beats first when nothing has a chord over it', () => {
    expect(rowsOf(7, 6)).toEqual([
      'beats',
      'string',
      'string',
      'string',
      'string',
      'string',
      'string'
    ])
  })

  it('puts a chord line above the beats when there is an extra row', () => {
    expect(rowsOf(8, 6).slice(0, 3)).toEqual(['chord', 'beats', 'string'])
  })
})

describe('what a character is', () => {
  it('picks the frets out of the dashes holding them up', () => {
    expect(inkOf('|-12--x-|', 'string')).toEqual([
      'bar',
      'string',
      'note',
      'note',
      'string',
      'string',
      'note',
      'string',
      'bar'
    ])
  })

  it('reads a slide as part of the note it slides into', () => {
    expect(inkOf('-4/7-', 'string')).toEqual(['string', 'note', 'note', 'note', 'string'])
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

  it('keeps the blank a cursor sits on past the end of a line off the string', () => {
    expect(inkOf('|-5- ', 'string')).toEqual(['bar', 'string', 'note', 'string', 'plain'])
  })

  it('does not mistake the digit in a chord name for a fret or a beat', () => {
    expect(inkOf('Am7', 'chord')).toEqual(['chord', 'chord', 'chord'])
  })
})

describe('over a real drawing', () => {
  const lines = render(parse('|-3-5-7-12-9---11---|')).replace(/\n$/, '').split('\n')
  const rows = rowsOf(lines.length, 6)

  it('inks every line of the system it was measured for', () => {
    expect(rows).toHaveLength(lines.length)
    expect(rows[0]).toBe('beats')
  })

  it('finds the twelfth fret on the top string, both digits of it', () => {
    const top = lines.findIndex((line) => line.includes('12'))
    const drawn = lines[top] as string
    const inks = inkOf(drawn, 'string')
    const at = drawn.indexOf('12')
    expect([inks[at], inks[at + 1]]).toEqual(['note', 'note'])
  })
})
