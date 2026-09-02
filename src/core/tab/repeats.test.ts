import { describe, expect, it } from 'vitest'

import { emptyBar, type TabDoc } from './document'
import { parse } from './parse'
import { render } from './render'

const rounds = (times: number): TabDoc => ({
  strings: 6,
  bars: [
    { ...emptyBar(6), repeatStart: true },
    { ...emptyBar(6), repeatTimes: times },
    emptyBar(6)
  ]
})

const plain = (): TabDoc => ({ strings: 6, bars: [emptyBar(6), emptyBar(6), emptyBar(6)] })

const rows = (doc: TabDoc) => render(doc).split('\n').filter((line) => line.startsWith('|'))

describe('drawing a repeat', () => {
  it('doubles the line where one begins', () => {
    expect(rows(rounds(1))[0]?.startsWith('||')).toBe(true)
  })

  it('puts the dots on the two strings in the middle of the staff', () => {
    const drawn = rows(rounds(1))
    expect(drawn.map((row) => row[2] === ':')).toEqual([false, false, true, true, false, false])
  })

  it('closes it with dots and a double line at the other end', () => {
    const drawn = rows(rounds(1))
    /* The bar that ends the repeat is the second one. */
    expect(drawn[2]).toContain(':||')
  })

  it('says nothing above a plain repeat, which goes round once', () => {
    expect(render(rounds(1))).not.toContain('x')
  })

  it('says how many times where it is more than twice', () => {
    expect(render(rounds(12))).toContain('x12')
  })

  it('draws no double line at all where nothing repeats', () => {
    expect(rows(plain())[0]?.startsWith('||')).toBe(false)
    expect(render(plain())).not.toContain(':')
  })
})

/* The dot is a mark on the staff, not a note, so it does not sit against one. */
describe('room around the dots', () => {
  const played = (): TabDoc => {
    const doc = rounds(1)
    const opening = doc.bars[0]?.beats[0]?.slots[0]
    const closing = doc.bars[1]?.beats[3]?.slots[1]
    if (opening !== undefined) opening.frets[2] = '9'
    if (closing !== undefined) closing.frets[3] = '7'
    return doc
  }

  it('keeps a column between the opening dot and the first note', () => {
    const row = rows(played())[2] ?? ''
    expect(row.startsWith('||:-9')).toBe(true)
  })

  it('keeps a column between the last note and the closing dot', () => {
    const row = rows(played())[3] ?? ''
    expect(row).toContain('7-:||')
  })

  it('leaves a bar with no repeat on it exactly as wide as it was', () => {
    expect(rows(plain())[0]?.split('|').filter((part) => part !== '')).toEqual([
      '-----------------',
      '-----------------',
      '-----------------'
    ])
  })
})

/* The count belongs to the repeat, which ends at the outer of the two lines. */
describe('where the count stands', () => {
  const marks = (times: number) => render(rounds(times)).split('\n')[0] ?? ''

  it('puts its last digit over the outer of the two closing lines', () => {
    const doc = rounds(12)
    const line = rows(doc)[0] ?? ''
    /* The second bar's closing lines are the last two before the third bar. */
    const outer = line.indexOf('||', line.indexOf('|', 2) + 1) + 1
    expect(marks(12).indexOf('x12') + 'x12'.length - 1).toBe(outer)
  })

  it('does the same however many digits it has', () => {
    for (const times of [3, 12, 100]) {
      const mark = `x${times}`
      const line = rows(rounds(times))[0] ?? ''
      const outer = line.indexOf('||', line.indexOf('|', 2) + 1) + 1
      expect(marks(times).indexOf(mark) + mark.length - 1).toBe(outer)
    }
  })
})

describe('reading a repeat back', () => {
  it('finds where it begins and where it ends', () => {
    const back = parse(render(rounds(1)))
    expect(back.bars[0]?.repeatStart).toBe(true)
    expect(back.bars[1]?.repeatTimes).toBe(1)
    expect(back.bars[2]?.repeatStart).toBeUndefined()
  })

  it('finds how many times round', () => {
    expect(parse(render(rounds(12))).bars[1]?.repeatTimes).toBe(12)
  })

  it('does not take the count for a beat', () => {
    const back = parse(render(rounds(12)))
    expect(back.bars[1]?.beats).toHaveLength(4)
    expect(back.bars.map((bar) => bar.beats.length)).toEqual([4, 4, 4])
  })

  it('reads nothing out of the gap inside a doubled line', () => {
    expect(parse(render(rounds(1))).bars).toHaveLength(3)
  })

  it('comes back byte for byte', () => {
    for (const times of [1, 3, 12]) {
      const text = render(rounds(times))
      expect(render(parse(text))).toBe(text)
    }
  })

  it('leaves the notes where they were, either side of the doubled line', () => {
    const doc = rounds(1)
    const slot = doc.bars[1]?.beats[2]?.slots[0]
    if (slot !== undefined) slot.frets[3] = '7'
    const back = parse(render(doc))
    expect(back.bars[1]?.beats[2]?.slots[0]?.frets[3]).toBe('7')
  })
})

/*
 * The count is written hard against the line that closes the bar, and in a bar
 * with as many beats as there is room for it lands right beside the last
 * beat's number. That is tight to read but it is not lost: the count is taken
 * off the line before the beats are read, so neither is mistaken for the
 * other, and the drawing says the same thing after a trip through the text as
 * it did before.
 */
describe('a count on a bar with no room to spare', () => {
  const crowded = (): TabDoc => ({
    strings: 6,
    bars: [{ ...emptyBar(6, 12), repeatTimes: 12 }, emptyBar(6, 12)]
  })

  it('keeps every beat of the bar', () => {
    expect(parse(render(crowded())).bars.map((bar) => bar.beats.length)).toEqual([12, 12])
  })

  it('keeps the count', () => {
    expect(parse(render(crowded())).bars[0]?.repeatTimes).toBe(12)
  })

  it('comes back byte for byte even so', () => {
    const text = render(crowded())
    expect(render(parse(text))).toBe(text)
  })
})
