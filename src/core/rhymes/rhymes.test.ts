import { describe, expect, it } from 'vitest'

import { askedFor, countSyllables, groupRhymes, parseRhymes } from './rhymes'

/* Exactly what the service sends back. */
const fromService = [
  { word: 'moan', score: 67035, numSyllables: 1 },
  { word: 'groan', score: 63035, numSyllables: 1 },
  { word: 'bemoan', score: 32030, numSyllables: 2 }
]

describe('askedFor', () => {
  it('takes the word out of what was typed', () => {
    expect(askedFor('  Alone ')).toBe('alone')
    expect(askedFor('alone,')).toBe('alone')
    expect(askedFor('"alone"')).toBe('alone')
  })

  it('keeps an apostrophe, which plenty of words worth rhyming have', () => {
    expect(askedFor("don't")).toBe("don't")
  })

  it('has nothing to ask for when nothing was typed', () => {
    expect(askedFor('   ')).toBe('')
    expect(askedFor('!?')).toBe('')
  })
})

describe('parseRhymes', () => {
  it('reads what the service sends', () => {
    expect(parseRhymes(fromService)).toEqual([
      { word: 'moan', syllables: 1 },
      { word: 'groan', syllables: 1 },
      { word: 'bemoan', syllables: 2 }
    ])
  })

  it('counts syllables itself when the service did not', () => {
    expect(parseRhymes([{ word: 'bemoan' }])).toEqual([{ word: 'bemoan', syllables: 2 }])
  })

  it('drops an entry that is not a word', () => {
    expect(parseRhymes([{ word: '' }, { word: 42 }, null, 'moan', { score: 1 }])).toEqual([])
  })

  it('is unbothered by a reply that is not a list at all', () => {
    expect(parseRhymes(null)).toEqual([])
    expect(parseRhymes({ error: 'nope' })).toEqual([])
    expect(parseRhymes('<html>502 Bad Gateway</html>')).toEqual([])
  })
})

describe('groupRhymes', () => {
  const perfect = parseRhymes(fromService)
  const near = [
    { word: 'control', syllables: 2 },
    { word: 'Moan', syllables: 1 },
    { word: 'although', syllables: 2 }
  ]

  it('keeps the two kinds apart', () => {
    const grouped = groupRhymes(perfect, near)
    expect(grouped.perfect.map((rhyme) => rhyme.word)).toEqual(['moan', 'groan', 'bemoan'])
    expect(grouped.near.map((rhyme) => rhyme.word)).toEqual(['control', 'although'])
  })

  it('says a word once, as the better kind of rhyme', () => {
    const grouped = groupRhymes(perfect, near)
    expect(grouped.near.some((rhyme) => rhyme.word.toLowerCase() === 'moan')).toBe(false)
  })

  it('stops before the list becomes a dictionary', () => {
    const many = Array.from({ length: 500 }, (_, index) => ({
      word: `word${index}`,
      syllables: 1
    }))
    const grouped = groupRhymes(many, many, 40)
    expect(grouped.perfect).toHaveLength(40)
    expect(grouped.near).toHaveLength(40)
  })

  it('does not repeat itself across the two lists when both are long', () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      word: `word${index}`,
      syllables: 1
    }))
    const grouped = groupRhymes(many, many, 40)
    const words = [...grouped.perfect, ...grouped.near].map((rhyme) => rhyme.word)
    expect(new Set(words).size).toBe(words.length)
  })
})

describe('countSyllables', () => {
  it('counts the vowel groups', () => {
    expect(countSyllables('stone')).toBe(1)
    expect(countSyllables('alone')).toBe(2)
    expect(countSyllables('overthrown')).toBe(3)
  })

  it('never answers nothing', () => {
    expect(countSyllables('')).toBe(1)
    expect(countSyllables('rhythm')).toBeGreaterThan(0)
  })
})
