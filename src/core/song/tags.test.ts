import { describe, expect, it } from 'vitest'

import {
  addTag,
  hasTag,
  knownTags,
  matchesTags,
  normaliseTag,
  parseTags,
  removeTag,
  suggestTags,
  TAGS_PER_SONG,
  TAG_MAX_LENGTH
} from './tags'

describe('normaliseTag', () => {
  it('tidies the spacing and leaves the words alone', () => {
    expect(normaliseTag('  open   D  ')).toBe('open D')
  })

  it('keeps the case it was typed in', () => {
    expect(normaliseTag('Open D')).toBe('Open D')
  })

  it('will not take a whole verse as a tag', () => {
    expect(normaliseTag('x'.repeat(80))).toHaveLength(TAG_MAX_LENGTH)
  })

  it('has nothing to make of nothing', () => {
    expect(normaliseTag('   ')).toBe('')
  })
})

describe('adding a tag', () => {
  it('adds it', () => {
    expect(addTag([], 'gig')).toEqual(['gig'])
  })

  it('keeps the list in order, so nothing shuffles when one arrives', () => {
    expect(addTag(['gig', 'zeppelin'], 'acoustic')).toEqual(['acoustic', 'gig', 'zeppelin'])
  })

  it('will not add the same tag twice, however it is shouted', () => {
    expect(addTag(['Gig'], 'gig')).toEqual(['Gig'])
    expect(addTag(['gig'], '  GIG ')).toEqual(['gig'])
  })

  it('ignores an empty one', () => {
    expect(addTag(['gig'], '   ')).toEqual(['gig'])
  })

  it('stops before a song has more tags than anybody can read', () => {
    const many = Array.from({ length: TAGS_PER_SONG }, (_, index) => `tag${index}`)
    expect(addTag(many, 'one more')).toHaveLength(TAGS_PER_SONG)
  })
})

describe('removing a tag', () => {
  it('removes it whatever case it is asked for in', () => {
    expect(removeTag(['Gig', 'acoustic'], 'gig')).toEqual(['acoustic'])
  })

  it('leaves the rest alone when it was not there', () => {
    expect(removeTag(['gig'], 'acoustic')).toEqual(['gig'])
  })
})

describe('knownTags', () => {
  it('gathers every tag in the library, once each', () => {
    const songs = [{ tags: ['gig', 'acoustic'] }, { tags: ['Gig', 'open D'] }]
    /* The first spelling seen is the one offered; they are the same tag. */
    expect(knownTags(songs)).toEqual(['acoustic', 'gig', 'open D'])
  })

  it('has nothing to gather from a library with no tags', () => {
    expect(knownTags([{ tags: [] }])).toEqual([])
  })
})

describe('suggesting a tag while it is typed', () => {
  const known = ['acoustic', 'gig', 'open D', 'opening']

  it('offers everything before anything is typed', () => {
    expect(suggestTags(known, '', [])).toEqual(known)
  })

  it('puts what starts with what was typed before what merely contains it', () => {
    expect(suggestTags(['looping', 'open D', 'opening'], 'op', [])).toEqual([
      'open D',
      'opening',
      'looping'
    ])
  })

  it('ignores case and stray spaces', () => {
    expect(suggestTags(known, '  OPEN ', [])).toEqual(['open D', 'opening'])
  })

  it('does not offer a tag the song already has', () => {
    expect(suggestTags(known, 'gi', ['gig'])).toEqual([])
    expect(suggestTags(known, 'g', ['gig'])).toEqual(['opening'])
  })
})

describe('filtering by tag', () => {
  it('keeps a song that has the chosen tag', () => {
    expect(matchesTags(['gig', 'acoustic'], ['gig'])).toBe(true)
  })

  it('leaves out a song that does not', () => {
    expect(matchesTags(['acoustic'], ['gig'])).toBe(false)
  })

  it('narrows rather than widens when a second tag is chosen', () => {
    expect(matchesTags(['gig', 'acoustic'], ['gig', 'acoustic'])).toBe(true)
    expect(matchesTags(['gig'], ['gig', 'acoustic'])).toBe(false)
  })

  it('keeps everything when nothing is chosen', () => {
    expect(matchesTags([], [])).toBe(true)
    expect(matchesTags(['gig'], [])).toBe(true)
  })

  it('ignores case, since the tags themselves do', () => {
    expect(matchesTags(['Gig'], ['gig'])).toBe(true)
  })
})

describe('reading tags off a song file', () => {
  it('takes the strings and tidies them', () => {
    expect(parseTags([' gig ', 'open   D'])).toEqual(['gig', 'open D'])
  })

  it('drops anything that is not a tag', () => {
    expect(parseTags(['gig', 42, null, '', {}])).toEqual(['gig'])
  })

  it('drops a duplicate however it is spelled', () => {
    expect(parseTags(['gig', 'GIG'])).toEqual(['gig'])
  })

  it('is unbothered by a file that says something else entirely', () => {
    expect(parseTags('gig')).toEqual([])
    expect(parseTags(undefined)).toEqual([])
  })
})

describe('hasTag', () => {
  it('ignores case', () => {
    expect(hasTag(['Open D'], 'open d')).toBe(true)
    expect(hasTag(['Open D'], 'open')).toBe(false)
  })
})
