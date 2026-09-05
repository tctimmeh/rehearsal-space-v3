import { describe, expect, it } from 'vitest'

import { emptyBar, emptySlot, newTab, normalise, type TabDoc } from './document'
import { parse } from './parse'
import { render } from './render'

/**
 * The bars below are lifted from the design sketch this was built from, and
 * they are the acceptance test for the whole format: read one, draw it again,
 * and it must come back the same to the character. That is what makes it safe
 * for the file on disk to be the drawing rather than something behind it.
 */
const sketch = {
  eighths: ['  1   2    3   4', '|-3-5-7-12-9---11---|'],
  /* Corrected: the sketch draws this a column wide, putting two spaces before
     the 2. Every other example agrees with the rule, so this one is wrong. */
  sixteenths: ['  1 e & 2   3   4', '|-4-5---------------|'],
  techniques: ['  1   2   3   4', '|-4/7-7\\4-4^5^4---|'],
  slideIntoNothing: ['  1   2   3   4', '|--/7-------------|'],
  bends: ['  1   2   3   4', '|-7b---r--9b------|'],
  chords: ['  Am      E', '  1   2   3   4', '|-----------------|']
} as const

const oneString = (block: readonly string[]): string => block.join('\n') + '\n'

describe('the sketch, read and drawn again', () => {
  for (const [what, block] of Object.entries(sketch)) {
    it(`comes back the same: ${what}`, () => {
      const text = oneString(block)
      expect(render(parse(text))).toBe(text)
    })
  }
})

/* Not in the sketch: a staccato is a mark on the note before it rather than a
   join between two, but it is written in the same column and has to survive
   the trip like anything else drawn there. */
describe('a staccato', () => {
  const bar = ['  1   2   3   4', '|-3.--5-----------|'] as const

  it('comes back the same', () => {
    expect(render(parse(oneString(bar)))).toBe(oneString(bar))
  })

  it('is read as belonging to the note it cuts short', () => {
    expect(parse(oneString(bar)).bars[0]?.beats[0]?.slots[0]?.after[0]).toBe('.')
  })
})

describe('what it understood', () => {
  const barOf = (block: readonly string[]) => parse(oneString(block)).bars[0]

  it('finds the notes on the right string at the right moment', () => {
    const bar = barOf(sketch.eighths)
    expect(bar?.beats).toHaveLength(4)
    expect(bar?.beats[0]?.slots[0]?.frets[0]).toBe('3')
    expect(bar?.beats[0]?.slots[1]?.frets[0]).toBe('5')
    expect(bar?.beats[1]?.slots[1]?.frets[0]).toBe('12')
  })

  /* Two slots to a beat is an eighth; four is sixteenths. Nothing records the
     division, so nothing can disagree with it. */
  /* A beat holds the beat and its eighth, and either sixteenth between them,
     so it is two, three or four slots — not a fixed division. Shift-right on
     the beat inserts one slot, which is what the sketch's prose describes. */
  it('reads a beat with an added sixteenth as three slots', () => {
    const bar = barOf(sketch.sixteenths)
    expect(bar?.beats[0]?.slots).toHaveLength(3)
    expect(bar?.beats[0]?.slots.map((slot) => slot.at)).toEqual([0, 1, 2])
    expect(bar?.beats[1]?.slots).toHaveLength(2)
  })

  it('reads a slide, a hammer-on and a pull-off as joins, not notes', () => {
    const bar = barOf(sketch.techniques)
    expect(bar?.beats[0]?.slots[0]?.after[0]).toBe('/')
    expect(bar?.beats[1]?.slots[0]?.after[0]).toBe('\\')
    expect(bar?.beats[2]?.slots[0]?.after[0]).toBe('^')
  })

  /* The sketch's own prose says a technique goes after the note under the
     cursor, and then shows one with no note before it at all. It is the join
     that carries it, so an empty slot can carry one too. */
  it('reads a slide into a note with nothing before it', () => {
    const bar = barOf(sketch.slideIntoNothing)
    expect(bar?.beats[0]?.slots[0]?.frets[0]).toBeNull()
    expect(bar?.beats[0]?.slots[0]?.after[0]).toBe('/')
    expect(bar?.beats[0]?.slots[1]?.frets[0]).toBe('7')
  })

  it('puts the chords back over the beats they were written above', () => {
    const bar = barOf(sketch.chords)
    expect(bar?.beats[0]?.chord).toBe('Am')
    expect(bar?.beats[2]?.chord).toBe('E')
  })
})

describe('a document drawn and read back', () => {
  it('survives when it is empty', () => {
    const doc = newTab()
    expect(render(parse(render(doc)))).toBe(render(doc))
  })

  it('keeps the number of strings, whatever it is', () => {
    for (const strings of [4, 6, 7]) {
      const doc: TabDoc = newTab(strings)
      expect(parse(render(doc)).strings).toBe(strings)
    }
  })

  it('assumes eighths when there is nothing to say otherwise', () => {
    const bar = parse('|-3-5-7-9---------|\n').bars[0]
    expect(bar?.beats).toHaveLength(4)
    expect(bar?.beats[0]?.slots).toHaveLength(2)
  })
})

/* The third of the sketch's sixteenth examples: a beat holding all four. */
const allFour = ['  1   2 e & a 3   4', '|-3-3-3-4-5-7-------|'].join('\n') + '\n'

describe('a beat in four', () => {
  it('comes back the same', () => {
    expect(render(parse(allFour))).toBe(allFour)
  })

  it('knows which of the four each slot stands on', () => {
    const bar = parse(allFour).bars[0]
    expect(bar?.beats[1]?.slots.map((slot) => slot.at)).toEqual([0, 1, 2, 3])
    expect(bar?.beats[0]?.slots.map((slot) => slot.at)).toEqual([0, 2])
  })
})

describe('several bars', () => {
  const two = ['  1   2   3   4     1   2   3   4', '|-----------------|-----------------|']

  it('are read as several bars', () => {
    expect(parse(two.join('\n') + '\n').bars).toHaveLength(2)
  })

  it('come back the same', () => {
    const text = two.join('\n') + '\n'
    expect(render(parse(text))).toBe(text)
  })

  /* Bars wrap whole, the way words do, and the beats and chords wrap with the
     bars they belong to. */
  it('wrap whole when they run out of room', () => {
    const doc = { strings: 6, bars: [emptyBar(6), emptyBar(6), emptyBar(6)] }
    const lines = render(doc, 40).split('\n\n')
    expect(lines.length).toBeGreaterThan(1)
    for (const block of lines) {
      for (const line of block.split('\n')) expect(line.length).toBeLessThanOrEqual(40)
    }
  })
})

/**
 * A file that has been edited by hand, or written by something else, should
 * open. Losing a whole bar over its last character is the wrong answer.
 */
describe('tablature that is drawn slightly wrong', () => {
  it('still opens when a bar is a column short', () => {
    const short = ['  1   2   3   4', '|-3-5-7-9--------|'].join('\n') + '\n'
    expect(parse(short).bars).toHaveLength(1)
    expect(parse(short).bars[0]?.beats[0]?.slots[0]?.frets[0]).toBe('3')
  })

  it('ignores a line that is not tablature at all', () => {
    const noise = ['some notes to self', '', '  1   2   3   4', '|-3---------------|'].join('\n')
    expect(parse(noise + '\n').bars).toHaveLength(1)
  })

  it('gives back nothing rather than throwing at an empty file', () => {
    expect(parse('').bars).toEqual([])
  })
})

describe('tidying up after an edit', () => {
  it('leaves exactly one spare bar to write into', () => {
    const doc = normalise({ strings: 6, bars: [emptyBar(6), emptyBar(6), emptyBar(6)] })
    expect(doc.bars).toHaveLength(1)
  })

  it('keeps the bars that have anything in them', () => {
    const played = emptyBar(6)
    const slot = played.beats[0]?.slots[0]
    if (slot) slot.frets[0] = '7'
    const doc = normalise({ strings: 6, bars: [played, emptyBar(6), emptyBar(6)] })
    expect(doc.bars).toHaveLength(2)
  })

  /* The beat and its eighth are what a beat is; only the sixteenths come and
     go, and only once whoever is typing has moved on. */
  it('takes away a sixteenth that was emptied', () => {
    const bar = emptyBar(6)
    const beat = bar.beats[0]
    if (beat) beat.slots = [...beat.slots, emptySlot(6, 1)].sort((a, b) => a.at - b.at)
    expect(beat?.slots).toHaveLength(3)

    const doc = normalise({ strings: 6, bars: [bar] })
    expect(doc.bars[0]?.beats[0]?.slots).toHaveLength(2)
  })

  it('keeps a sixteenth that has a note in it', () => {
    const bar = emptyBar(6)
    const beat = bar.beats[0]
    const added = emptySlot(6, 1)
    added.frets[0] = '5'
    if (beat) beat.slots = [...beat.slots, added].sort((a, b) => a.at - b.at)

    const doc = normalise({ strings: 6, bars: [bar] })
    expect(doc.bars[0]?.beats[0]?.slots).toHaveLength(3)
  })
})

/**
 * The rule that decides every column is only worth having if it is reversible.
 * Rather than trusting a handful of examples, this builds documents at random
 * and insists that drawing one, reading it back and drawing it again lands in
 * exactly the same place.
 */
describe('any document at all', () => {
  let seed = 7
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const pick = <T,>(from: readonly T[]): T => from[Math.floor(random() * from.length)] as T

  const someBar = (strings: number) => {
    const bar = emptyBar(strings, 3 + Math.floor(random() * 10))
    for (const beat of bar.beats) {
      /* Sixteenths, sometimes: an e, an a, or both. */
      for (const at of [1, 3] as const) {
        if (random() < 0.25) beat.slots = [...beat.slots, emptySlot(strings, at)]
      }
      beat.slots.sort((one, other) => one.at - other.at)
      for (const slot of beat.slots) {
        for (let string = 0; string < strings; string += 1) {
          if (random() < 0.18) slot.frets[string] = String(Math.floor(random() * 25))
          if (random() < 0.06) slot.after[string] = pick(['/', '\\', '^', '.', 'b', 'r'] as const)
        }
      }
      if (random() < 0.12) beat.chord = pick(['Am', 'E', 'Dm7', 'C', 'G/B'])
    }
    return bar
  }

  it('draws the same the second time', () => {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const strings = pick([4, 6, 7])
      const doc: TabDoc = {
        strings,
        bars: Array.from({ length: 1 + Math.floor(random() * 4) }, () => someBar(strings))
      }
      const once = render(doc)
      expect(render(parse(once))).toBe(once)
    }
  })
})

/*
 * A bend is a character in the column that follows the note, which every slot
 * has already. The whole reason for writing it that way rather than as `7b9`
 * is that it costs nothing, so that is worth holding to.
 */
describe('what a bend costs', () => {
  /* Six strings, with the second one carrying whatever is passed in. */
  const bar = (line: string): string =>
    [
      '  1   2   3   4',
      '|-----------------|',
      `|${line}|`,
      '|-----------------|',
      '|-----------------|',
      '|-----------------|',
      '|-----------------|'
    ].join('\n') + '\n'

  it('takes up no more room than the same bar without one', () => {
    const plain = bar('-7-------9-------')
    const bent = bar('-7b------9b------')

    expect(render(parse(bent))).toBe(bent)
    expect(render(parse(bent)).length).toBe(render(parse(plain)).length)
  })

  it('is read back as a bend and a release on the string it was written on', () => {
    const doc = parse(bar('-7b---r----------'))
    const beats = doc.bars[0]?.beats

    expect(beats?.[0]?.slots[0]?.after[1]).toBe('b')
    expect(beats?.[1]?.slots[0]?.after[1]).toBe('r')
    /* And on no other string. */
    expect(beats?.[0]?.slots[0]?.after[0]).toBe('-')
  })
})
