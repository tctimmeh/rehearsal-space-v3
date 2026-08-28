import { describe, expect, it } from 'vitest'

import {
  actionFor,
  BINDING_COUNT,
  HOTKEY_GROUPS,
  hotkeysInGroup,
  type Keystroke
} from './hotkeys'

const stroke = (patch: Partial<Keystroke>): Keystroke => ({
  key: '',
  code: '',
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...patch
})

const press = (patch: Partial<Keystroke>, typing = false) => actionFor(stroke(patch), typing)

describe('the space bar', () => {
  it('plays and pauses on its own', () => {
    expect(press({ code: 'Space' })).toBe('playPause')
  })

  /* The plain space bar would answer for all three if it were asked first. */
  it('records with shift', () => {
    expect(press({ code: 'Space', shiftKey: true })).toBe('recordAndPlay')
  })

  it('throws a take away with control', () => {
    expect(press({ code: 'Space', ctrlKey: true })).toBe('discardTake')
  })

  it('means nothing with both', () => {
    expect(press({ code: 'Space', ctrlKey: true, shiftKey: true })).toBeNull()
  })
})

describe('the rest of them', () => {
  it('arms recording on shift and R', () => {
    expect(press({ key: 'R', shiftKey: true })).toBe('armRecording')
  })

  it('does not arm on R alone, which is a letter somebody might want', () => {
    expect(press({ key: 'r' })).toBeNull()
  })

  it('goes to the top of the song on Home', () => {
    expect(press({ key: 'Home' })).toBe('toStart')
  })

  it('loops on L, whichever case it arrives in', () => {
    expect(press({ key: 'l' })).toBe('loop')
    expect(press({ key: 'L', shiftKey: true })).toBeNull()
  })

  it('shows the metronome on F1 and the tuner on F2', () => {
    expect(press({ key: 'F1' })).toBe('metronomeTool')
    expect(press({ key: 'F2' })).toBe('tunerTool')
  })

  it('still starts the metronome on tilde', () => {
    expect(press({ key: '`' })).toBe('metronomeRunning')
  })
})

/**
 * A hotkey that fires while somebody is writing lyrics is a bug: "l" belongs
 * to the word, and Home belongs to the line.
 */
describe('while typing', () => {
  it('leaves the letters alone', () => {
    expect(press({ key: 'l' }, true)).toBeNull()
    expect(press({ key: 'R', shiftKey: true }, true)).toBeNull()
  })

  it('leaves Home to the line', () => {
    expect(press({ key: 'Home' }, true)).toBeNull()
  })

  it('leaves the space bar to the sentence', () => {
    expect(press({ code: 'Space' }, true)).toBeNull()
  })

  /* Nobody types an F1. */
  it('still shows a tool on a function key', () => {
    expect(press({ key: 'F1' }, true)).toBe('metronomeTool')
    expect(press({ key: 'F2' }, true)).toBe('tunerTool')
  })
})

/**
 * The list shown to the user is read from the same table the keys are matched
 * against. A help page that lies about a shortcut is worse than none, so the
 * thing to guard is that the two cannot drift apart.
 */
describe('the list of them', () => {
  const everything = HOTKEY_GROUPS.flatMap((group) => hotkeysInGroup(group))

  it('accounts for every key the app answers to', () => {
    expect(everything).toHaveLength(BINDING_COUNT)
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
    expect(written).toContain('Shift + Space')
    expect(written).toContain('Ctrl + Space')
    expect(written).toContain('Shift + R')
  })

  it('puts each one in exactly one group', () => {
    const counted = new Set(everything.map((entry) => entry.keys))
    expect(counted.size).toBe(everything.length)
  })
})
