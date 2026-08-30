import { describe, expect, it } from 'vitest'

import { TAB_KEY_COUNT, TAB_KEY_GROUPS, tabKeysInGroup } from './keys'

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
