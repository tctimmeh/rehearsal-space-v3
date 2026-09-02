import { describe, expect, it } from 'vitest'
import { emptyBar, newTab, normalise, type TabDoc } from './document'
import { parse } from './parse'
import { render } from './render'
import { AT_START, typeFret } from './edit'

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
