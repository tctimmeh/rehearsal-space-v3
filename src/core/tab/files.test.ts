import { describe, expect, it } from 'vitest'

import type { TabFile } from '../song/song'
import { newTabFile, untakenFile, untakenName } from './files'

const tab = (name: string, file: string, id = name.toLowerCase()): TabFile => ({
  id,
  file,
  name,
  strings: 6
})

describe('naming a new tablature', () => {
  it('takes the name asked for when nobody has it', () => {
    expect(untakenName([], 'Rhythm')).toBe('Rhythm')
  })

  it('numbers it when somebody does', () => {
    expect(untakenName([tab('Rhythm', 'tabs/rhythm.txt')], 'Rhythm')).toBe('Rhythm 2')
  })

  it('does not mind how it was capitalised', () => {
    expect(untakenName([tab('Rhythm', 'tabs/rhythm.txt')], 'rhythm')).toBe('rhythm 2')
  })

  it('falls back to something rather than nothing', () => {
    expect(untakenName([], '   ')).toBe('Tab')
  })
})

describe('where it is kept', () => {
  it('is named after what it holds', () => {
    expect(untakenFile([], 'Lead Guitar')).toBe('tabs/lead-guitar.txt')
  })

  /* The name becomes a filename, so it is a slug and not the name itself. */
  it('will not write itself into a folder that does not exist', () => {
    expect(untakenFile([], 'Lead / Rhythm')).not.toContain('/Rhythm')
    expect(untakenFile([], 'Lead / Rhythm').startsWith('tabs/')).toBe(true)
  })

  it('finds another when the obvious one is taken', () => {
    expect(untakenFile([tab('Lead', 'tabs/lead.txt')], 'Lead')).toBe('tabs/lead-2.txt')
  })

  it('has something to fall back on when the name is all punctuation', () => {
    expect(untakenFile([], '???')).toBe('tabs/tab.txt')
  })
})

describe('a whole new entry', () => {
  it('clashes with nothing already there', () => {
    const held = [newTabFile([], 'Lead')]
    const second = newTabFile(held, 'Lead')

    expect(second.id).not.toBe(held[0]?.id)
    expect(second.file).not.toBe(held[0]?.file)
    expect(second.name).not.toBe(held[0]?.name)
  })

  it('remembers how many strings it is for', () => {
    expect(newTabFile([], 'Bass', 4).strings).toBe(4)
  })
})
