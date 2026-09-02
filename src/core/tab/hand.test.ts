import { describe, expect, it } from 'vitest'

import { newTab, vibratoWidth, type TabDoc } from './document'
import { AT_START, typeFret } from './edit'
import { parse } from './parse'
import { render } from './render'

const played = (): TabDoc => {
  let state = { doc: newTab(6), cursor: { ...AT_START, string: 5 } }
  for (const step of [0, 1, 2, 3]) {
    state = typeFret({ ...state, cursor: { bar: 0, beat: step, slot: 0, string: 5 } }, '4', Infinity)
  }
  return state.doc
}

const marked = (patch: (doc: TabDoc) => void): TabDoc => {
  const doc = played()
  patch(doc)
  return doc
}

const handRow = (text: string): string | undefined =>
  text.split('\n').find((line) => line.trim() !== '' && /^[ x~]+$/.test(line))

describe('how long a vibrato is drawn', () => {
  /* One press is a half beat and each after it adds two marks, so the wave
     grows by a beat's worth either side of what came before. */
  it('grows by two marks for every half beat after the first', () => {
    expect([1, 2, 3, 4].map(vibratoWidth)).toEqual([1, 3, 5, 7])
  })

  it('is nothing at all when there is none', () => {
    expect(vibratoWidth(0)).toBe(0)
  })
})

describe('palm mutes and vibrato in the drawing', () => {
  it('writes a palm mute over the note it damps', () => {
    const doc = marked((one) => {
      const slot = one.bars[0]?.beats[0]?.slots[0]
      if (slot !== undefined) slot.palm = true
    })
    const row = handRow(render(doc)) ?? ''
    expect(row.trim()).toBe('x')
    /* Over the note: the bar opens with a pipe and a dash. */
    expect(row.indexOf('x')).toBe(2)
  })

  it('writes a vibrato as a wave running on from its note', () => {
    const doc = marked((one) => {
      const slot = one.bars[0]?.beats[1]?.slots[0]
      if (slot !== undefined) slot.vibrato = 2
    })
    expect((handRow(render(doc)) ?? '').trim()).toBe('~~~')
  })

  it('draws no row at all when the hand is doing nothing', () => {
    expect(handRow(render(played()))).toBeUndefined()
  })

  it('puts the row under the beats and over the strings', () => {
    const doc = marked((one) => {
      const slot = one.bars[0]?.beats[0]?.slots[0]
      if (slot !== undefined) slot.palm = true
    })
    const lines = render(doc).split('\n')
    const beats = lines.findIndex((line) => line.includes('1'))
    const hand = lines.findIndex((line) => /^[ x~]+$/.test(line) && line.trim() !== '')
    const strings = lines.findIndex((line) => line.startsWith('|'))
    expect(beats).toBeLessThan(hand)
    expect(hand).toBeLessThan(strings)
  })
})

describe('reading them back', () => {
  const roundTrip = (patch: (doc: TabDoc) => void) => {
    const doc = marked(patch)
    const text = render(doc)
    return { text, back: parse(text) }
  }

  it('finds the palm mute on the slot it was written over', () => {
    const { back } = roundTrip((one) => {
      const slot = one.bars[0]?.beats[2]?.slots[0]
      if (slot !== undefined) slot.palm = true
    })
    expect(back.bars[0]?.beats[2]?.slots[0]?.palm).toBe(true)
    expect(back.bars[0]?.beats[0]?.slots[0]?.palm).toBeUndefined()
  })

  it('counts the half beats of a vibrato back out of the wave', () => {
    for (const halves of [1, 2, 3, 4]) {
      const { back } = roundTrip((one) => {
        const slot = one.bars[0]?.beats[0]?.slots[0]
        if (slot !== undefined) slot.vibrato = halves
      })
      expect(back.bars[0]?.beats[0]?.slots[0]?.vibrato).toBe(halves)
    }
  })

  it('comes back byte for byte', () => {
    const { text } = roundTrip((one) => {
      const first = one.bars[0]?.beats[0]?.slots[0]
      const later = one.bars[0]?.beats[2]?.slots[0]
      if (first !== undefined) first.palm = true
      if (later !== undefined) later.vibrato = 2
    })
    expect(render(parse(text))).toBe(text)
  })

  /* The row of marks sits where the beats would otherwise be looked for. */
  it('still finds the beats with a hand row in the way', () => {
    const { back } = roundTrip((one) => {
      const slot = one.bars[0]?.beats[0]?.slots[0]
      if (slot !== undefined) slot.palm = true
    })
    expect(back.bars[0]?.beats).toHaveLength(4)
  })
})
