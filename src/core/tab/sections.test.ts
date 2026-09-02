import { describe, expect, it } from 'vitest'
import { barIsEmpty, emptyBar, newTab, normalise, type Bar, type TabDoc } from './document'
import { parse } from './parse'
import { render } from './render'
import { AT_START, openSection, settle, typeFret, withRoomToCarryOn } from './edit'

const withSections = (): TabDoc => {
  let doc = { strings: 6, bars: [emptyBar(6), emptyBar(6), emptyBar(6)] } as TabDoc
  doc = { ...doc, bars: doc.bars.map((bar, i) =>
    i === 0 ? { ...bar, opens: 'Verse:' }
    : i === 2 ? { ...bar, opens: 'Chorus:\nlet the last chord ring' }
    : bar) }
  let state = { doc, cursor: { ...AT_START, string: 2 } }
  state = typeFret(state, '5', Infinity)
  state = typeFret({ ...state, cursor: { bar: 2, beat: 0, slot: 0, string: 3 } }, '7', Infinity)
  return state.doc
}

describe('sections divided by free text', () => {
  it('writes the words above the section they open', () => {
    const text = render(withSections())
    expect(text.split('\n')[0]).toBe('Verse:')
    expect(text).toContain('Chorus:\nlet the last chord ring\n')
  })

  it('reads them back onto the same bars', () => {
    const doc = withSections()
    const back = parse(render(doc))
    expect(back.bars[0]?.opens).toBe('Verse:')
    expect(back.bars[1]?.opens).toBeUndefined()
    expect(back.bars[2]?.opens).toBe('Chorus:\nlet the last chord ring')
  })

  it('comes back byte for byte', () => {
    const text = render(withSections())
    expect(render(parse(text))).toBe(text)
  })

  /* All three bars fit across one line at the wrap width, so two systems can
     only be the section break putting them there. */
  it('starts a new system at a section even where the bar would have fitted', () => {
    const rows = render(withSections()).split('\n').filter((line) => line.startsWith('|'))
    expect(rows).toHaveLength(12)

    const together = render({ ...withSections(), bars: withSections().bars.map(({ opens: _, ...bar }) => bar) })
    expect(together.split('\n').filter((line) => line.startsWith('|'))).toHaveLength(6)
  })

  it('keeps the bars that follow it in the same section', () => {
    const doc = parse(render(withSections()))
    expect(doc.bars.map((bar) => bar.opens)).toEqual([
      'Verse:',
      undefined,
      'Chorus:\nlet the last chord ring'
    ])
  })

  it('drops a section opened but never named', () => {
    const doc: TabDoc = { strings: 6, bars: [{ ...emptyBar(6), opens: '' }, emptyBar(6)] }
    expect(normalise(doc).bars[0]?.opens).toBeUndefined()
  })

  it('keeps it while the cursor is still in it', () => {
    const doc: TabDoc = { strings: 6, bars: [{ ...emptyBar(6), opens: '' }, emptyBar(6)] }
    expect(normalise(doc, { bar: 0, beat: 0, writing: 0 }).bars[0]?.opens).toBe('')
  })

  it('does not sweep away a named section with no notes under it yet', () => {
    const doc: TabDoc = { strings: 6, bars: [emptyBar(6), { ...emptyBar(6), opens: 'Solo:' }] }
    const settled = normalise(doc)
    expect(settled.bars.some((bar) => bar.opens === 'Solo:')).toBe(true)
  })

  it('leaves an ordinary document alone', () => {
    const text = render(normalise(newTab(6)))
    expect(render(parse(text))).toBe(text)
    expect(parse(text).bars.every((bar) => bar.opens === undefined)).toBe(true)
  })
})

/*
 * A section with another section after it used to have nowhere to grow: the
 * next section's first bar came straight after its last, so there was no empty
 * bar to carry on writing in.
 */
describe('room to carry on with a section', () => {
  const played = (): TabDoc => {
    let state = { doc: newTab(6), cursor: { ...AT_START, string: 2 } }
    state = typeFret(state, '5', Infinity)
    return settle(state).doc
  }

  it('leaves an empty bar behind when a section is opened after one', () => {
    const doc = played()
    const at = { bar: doc.bars.length - 1, beat: 0, slot: 0, string: 0 }

    const opened = openSection({ doc, cursor: at })

    const opensAt = opened.doc.bars.findIndex((bar) => bar.opens !== undefined)
    expect(opensAt).toBeGreaterThan(0)
    expect(barIsEmpty(opened.doc.bars[opensAt - 1] as Bar)).toBe(true)
    expect(opened.doc.bars[opensAt - 1]?.opens).toBeUndefined()
  })

  /* The bar the cursor was on has moved down past the one put in front. */
  it('takes the cursor along with the bar it was on', () => {
    const doc = played()
    const at = { bar: doc.bars.length - 1, beat: 0, slot: 0, string: 0 }

    const opened = openSection({ doc, cursor: at })

    expect(opened.cursor.bar).toBe(at.bar + 1)
    expect(opened.doc.bars[opened.cursor.bar]?.opens).toBe('')
  })

  it('gives every section one, however many there are', () => {
    const bars = [
      { ...emptyBar(6), opens: 'One' },
      emptyBar(6),
      { ...emptyBar(6), opens: 'Two' },
      { ...emptyBar(6), opens: 'Three' }
    ]
    const spaced = withRoomToCarryOn({ doc: { strings: 6, bars }, cursor: AT_START })

    for (const [index, bar] of spaced.doc.bars.entries()) {
      if (bar.opens === undefined || index === 0) continue
      expect(spareAtIsEmpty(spaced.doc, index - 1)).toBe(true)
    }
  })

  it('adds nothing where a section already ends in an empty bar', () => {
    const bars = [emptyBar(6), emptyBar(6), { ...emptyBar(6), opens: 'Two' }]
    const state = { doc: { strings: 6, bars } as TabDoc, cursor: AT_START }

    expect(withRoomToCarryOn(state)).toBe(state)
  })

  it('keeps the room through a settle, rather than tidying it away', () => {
    const doc = played()
    const opened = openSection({ doc, cursor: { bar: doc.bars.length - 1, beat: 0, slot: 0, string: 0 } })

    const settled = settle({ ...opened, doc: { ...opened.doc, bars: opened.doc.bars.map((b, i) =>
      i === opened.cursor.bar ? { ...b, opens: 'Chorus' } : b) } })

    const opensAt = settled.doc.bars.findIndex((bar) => bar.opens !== undefined)
    expect(barIsEmpty(settled.doc.bars[opensAt - 1] as Bar)).toBe(true)
  })
})

const spareAtIsEmpty = (doc: TabDoc, at: number): boolean => {
  const bar = doc.bars[at]
  return bar !== undefined && bar.opens === undefined && barIsEmpty(bar)
}
