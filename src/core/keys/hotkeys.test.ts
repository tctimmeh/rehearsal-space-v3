import { describe, expect, it } from 'vitest'

import {
  actionFor,
  BINDING_COUNT,
  DEFAULT_NUDGE,
  HOTKEY_GROUPS,
  hotkeysInGroup,
  nudgeFor,
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

  /* R on its own is the latch beside the transport rather than the record
     button: arming is the shifted one. */
  it('latches auto return on R alone, whichever case it arrives in', () => {
    expect(press({ key: 'r' })).toBe('autoReturn')
    expect(press({ key: 'R' })).toBe('autoReturn')
  })

  it('leaves R to whoever is typing', () => {
    expect(press({ key: 'r' }, true)).toBeNull()
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
describe('the arrow keys', () => {
  it('move the playhead either way', () => {
    expect(press({ key: 'ArrowLeft' })).toBe('nudgeBack')
    expect(press({ key: 'ArrowRight' })).toBe('nudgeForward')
  })

  /* The modifiers choose how far rather than what, so all four combinations
     are the same pair of keys. */
  it('still mean the same thing with the modifiers that size them', () => {
    expect(press({ key: 'ArrowLeft', ctrlKey: true })).toBe('nudgeBack')
    expect(press({ key: 'ArrowRight', shiftKey: true })).toBe('nudgeForward')
    expect(press({ key: 'ArrowRight', ctrlKey: true, shiftKey: true })).toBe('nudgeForward')
  })

  it('leaves the window manager its own', () => {
    expect(press({ key: 'ArrowLeft', altKey: true })).toBeNull()
    expect(press({ key: 'ArrowRight', metaKey: true })).toBeNull()
  })

  it('belong to the cursor while somebody is typing', () => {
    expect(press({ key: 'ArrowLeft' }, true)).toBeNull()
  })
})

describe('how far an arrow goes', () => {
  const far = (patch: Partial<Keystroke>) => nudgeFor(stroke(patch), DEFAULT_NUDGE)

  it('is a short step on its own and a longer one for each modifier', () => {
    expect(far({})).toBe(3)
    expect(far({ ctrlKey: true })).toBe(6)
    expect(far({ shiftKey: true })).toBe(10)
    expect(far({ ctrlKey: true, shiftKey: true })).toBe(15)
  })

  it('is whatever it has been set to', () => {
    const sizes = { plain: 1, ctrl: 2, shift: 4, both: 8 }

    expect(nudgeFor(stroke({ shiftKey: true }), sizes)).toBe(4)
    expect(nudgeFor(stroke({ ctrlKey: true, shiftKey: true }), sizes)).toBe(8)
  })
})

describe('the tempo keys', () => {
  it('take a step either way', () => {
    expect(press({ key: '-' })).toBe('tempoDown')
    expect(press({ key: '=' })).toBe('tempoUp')
  })

  /* The same physical keys write these with Shift, and reaching for Shift to
     get a bigger step is a reasonable thing to try. */
  it('mean the same thing shifted', () => {
    expect(press({ key: '_' })).toBe('tempoDown')
    expect(press({ key: '+' })).toBe('tempoUp')
  })

  it('leave the zoom and the window manager their own', () => {
    expect(press({ key: '-', ctrlKey: true })).toBeNull()
    expect(press({ key: '=', altKey: true })).toBeNull()
  })

  it('are characters, so they belong to whoever is typing', () => {
    expect(press({ key: '-' }, true)).toBeNull()
  })
})

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

  /* The arrows do whatever they have been set to, so the list has to read the
     settings rather than repeat the numbers it was written with. */
  it('says how far the arrows are set to go', () => {
    const [arrow] = hotkeysInGroup('Playing', { plain: 2, ctrl: 5, shift: 9, both: 30 }).filter(
      (entry) => entry.keys === '←'
    )

    expect(arrow?.does).toContain('2s')
    expect(arrow?.does).toContain('5s')
    expect(arrow?.does).toContain('9s')
    expect(arrow?.does).toContain('30s')
  })

  it('says that the arrows keep going while they are held', () => {
    const rows = hotkeysInGroup('Playing').filter((entry) => entry.keys === '→')

    expect(rows[0]?.does).toMatch(/hold/i)
  })

  it('puts each one in exactly one group', () => {
    const counted = new Set(everything.map((entry) => entry.keys))
    expect(counted.size).toBe(everything.length)
  })
})
