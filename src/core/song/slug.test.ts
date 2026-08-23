import { describe, expect, it } from 'vitest'

import { isSafeSongId, slugify, uniqueSlug } from './slug'

describe('slugify', () => {
  it('lowercases and joins words with hyphens', () => {
    expect(slugify('Comeback Season')).toBe('comeback-season')
  })

  it('strips punctuation and diacritics', () => {
    expect(slugify("Don't Look Back!")).toBe('don-t-look-back')
    expect(slugify('Café Cliché')).toBe('cafe-cliche')
  })

  it('collapses runs and trims edges', () => {
    expect(slugify('  ---Hello   World---  ')).toBe('hello-world')
  })

  it('falls back when a title has nothing usable in it', () => {
    expect(slugify('!!!')).toBe('song')
    expect(slugify('')).toBe('song')
  })
})

describe('uniqueSlug', () => {
  it('leaves a free slug alone', () => {
    expect(uniqueSlug('new-song', ['other'])).toBe('new-song')
  })

  it('numbers from 2 upward, since every song starts life as "New Song"', () => {
    expect(uniqueSlug('new-song', ['new-song'])).toBe('new-song-2')
    expect(uniqueSlug('new-song', ['new-song', 'new-song-2'])).toBe('new-song-3')
  })

  it('fills a gap rather than always taking the highest', () => {
    expect(uniqueSlug('new-song', ['new-song', 'new-song-3'])).toBe('new-song-2')
  })
})

describe('isSafeSongId', () => {
  it('accepts slugs it produced', () => {
    expect(isSafeSongId('comeback-season')).toBe(true)
    expect(isSafeSongId('new-song-2')).toBe(true)
  })

  it('rejects anything that could escape the library directory', () => {
    expect(isSafeSongId('..')).toBe(false)
    expect(isSafeSongId('../etc')).toBe(false)
    expect(isSafeSongId('a/b')).toBe(false)
    expect(isSafeSongId('')).toBe(false)
    expect(isSafeSongId('-leading')).toBe(false)
    expect(isSafeSongId('Upper')).toBe(false)
  })
})
