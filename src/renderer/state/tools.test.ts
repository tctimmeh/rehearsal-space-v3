import { beforeEach, describe, expect, it } from 'vitest'

import { TOOL_IDS, TOOL_META } from '@core/tools'
import { openToolOfSize, stageOnShow, useTools } from './tools'

const allClosed = Object.fromEntries(TOOL_IDS.map((id) => [id, false])) as Record<
  (typeof TOOL_IDS)[number],
  boolean
>

beforeEach(() => {
  useTools.setState({ open: allClosed, justOpened: null })
})

const open = () => useTools.getState().open
const toggle = (id: Parameters<ReturnType<typeof useTools.getState>['toggle']>[0]) =>
  useTools.getState().toggle(id)

describe('what can be open at once', () => {
  it('keeps one tool on the stage', () => {
    toggle('tab')
    toggle('lyrics')

    expect(open().lyrics).toBe(true)
    expect(open().tab).toBe(false)
  })

  /*
   * The drawer is one place too. With the chart in it beside the rhymes,
   * opening both left the rail lit for two tools and the drawer showing
   * whichever came first in the list.
   */
  it('keeps one tool in the drawer', () => {
    toggle('rhymes')
    toggle('chords')

    expect(open().chords).toBe(true)
    expect(open().rhymes).toBe(false)
    expect(openToolOfSize(open(), 'drawer')).toBe('chords')
  })

  it('does not let the drawer close what is on the stage, or the other way about', () => {
    toggle('tab')
    toggle('chords')

    expect(open().tab).toBe(true)
    expect(open().chords).toBe(true)
    expect(stageOnShow(open())).toBe('tab')
  })

  it('lets the gadgets sit side by side', () => {
    toggle('metronome')
    toggle('tuner')

    expect(open().metronome).toBe(true)
    expect(open().tuner).toBe(true)
  })

  it('closes a tool that is asked for twice, taking nothing else with it', () => {
    toggle('chords')
    toggle('tab')
    toggle('chords')

    expect(open().chords).toBe(false)
    expect(open().tab).toBe(true)
  })
})

describe('what was asked for', () => {
  it('remembers the tool last opened, and not the one closed', () => {
    toggle('tab')
    expect(useTools.getState().justOpened).toBe('tab')

    toggle('tab')
    expect(useTools.getState().justOpened).toBe('tab')
  })

  it('counts a song bringing its tools back as nobody asking', () => {
    toggle('tab')

    useTools.getState().setOpenScoped((id) => TOOL_META[id].scope === 'song', ['chords'])

    expect(useTools.getState().justOpened).toBeNull()
    expect(open().chords).toBe(true)
    expect(open().tab).toBe(false)
  })
})
