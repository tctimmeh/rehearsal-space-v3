import { describe, expect, it } from 'vitest'

import { TAB_KEY_COUNT, TAB_KEY_GROUPS, TAB_KEY_HINTS, tabKeyExists, tabKeysInGroup } from './keys'

describe('the tablature keys', () => {
  const everything = TAB_KEY_GROUPS.flatMap((group) => tabKeysInGroup(group))

  it('accounts for every one of them', () => {
    expect(everything).toHaveLength(TAB_KEY_COUNT)
  })

  it('says what each one does', () => {
    for (const { keys, does } of everything) {
      expect(keys.length).toBeGreaterThan(0)
      expect(does.length).toBeGreaterThan(0)
    }
  })

  /* Written the way it is pressed, so it can be found on the keyboard. */
  it('writes the modified ones out in full', () => {
    const written = everything.map((entry) => entry.keys)

    expect(written).toContain('Ctrl + ↑')
    expect(written).toContain('Shift + →')
  })

  /* A key can mean two things in two places — X frets a mute, and cuts the
     beats picked out — so it is the pair that has to be unique, not the key. */
  it('does not say the same thing twice', () => {
    const said = new Set(everything.map((entry) => `${entry.keys} ${entry.does}`))

    expect(said.size).toBe(everything.length)
  })
})

describe('the hints under the editor', () => {
  /* The point of the line is the keys nobody would try. Arrows and digits are
     found by pressing them, and a hint spent on one is a hint wasted. */
  it('reminds of the keys that have to be told, not the ones you would guess', () => {
    const does = TAB_KEY_HINTS.map((hint) => hint.does)

    expect(does).toContain('Select')
    expect(does).toContain('Triplets')
    expect(does).not.toContain('Move the cursor, as the tablature is drawn')
  })

  /* A hint for a key the editor stopped answering to is worse than no hint. */
  it('names only keys the editor still answers to', () => {
    for (const hint of TAB_KEY_HINTS) {
      for (const key of hint.covers) {
        expect(tabKeyExists(key), key).toBe(true)
      }
    }
  })

  it('says which keys it stands for, even where it prints them as one', () => {
    const pair = TAB_KEY_HINTS.find((hint) => hint.covers.length > 1)

    expect(pair?.covers).toEqual(['Ctrl + ←', 'Ctrl + →'])
  })

  /* One line under the editor, not a second copy of the ? panel. */
  it('stays short enough to be one line', () => {
    expect(TAB_KEY_HINTS.length).toBeLessThan(9)
    for (const { does } of TAB_KEY_HINTS) expect(does.length).toBeLessThan(20)
  })

  it('knows a key it has from one it has not', () => {
    expect(tabKeyExists('Ctrl + R')).toBe(true)
    expect(tabKeyExists('Ctrl + Q')).toBe(false)
  })
})
