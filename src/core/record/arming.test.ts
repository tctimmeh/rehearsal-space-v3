import { describe, expect, it } from 'vitest'

import { stepRecording, timelineIsOpen, type RecordPhase } from './arming'

const stopped = false
const playing = true

describe('arming', () => {
  it('waits for the player rather than capturing the wait', () => {
    expect(stepRecording('off', 'toggle', stopped)).toEqual({ phase: 'armed', take: null })
  })

  it('starts the take when the player is engaged', () => {
    expect(stepRecording('armed', 'play', stopped)).toEqual({ phase: 'recording', take: 'begin' })
  })

  it('starts there and then when armed mid-song', () => {
    expect(stepRecording('off', 'toggle', playing)).toEqual({
      phase: 'recording',
      take: 'begin'
    })
  })

  it('changes its mind without leaving a take behind', () => {
    expect(stepRecording('armed', 'toggle', stopped)).toEqual({ phase: 'off', take: null })
  })
})

describe('finishing a take', () => {
  it('stops the player, the take, and the arming together', () => {
    expect(stepRecording('recording', 'stop', playing)).toEqual({ phase: 'off', take: 'finish' })
  })

  it('punches out on pause but stays ready for another', () => {
    expect(stepRecording('recording', 'pause', playing)).toEqual({
      phase: 'armed',
      take: 'finish'
    })
  })

  it('lays down a second take when the player carries on', () => {
    const paused = stepRecording('recording', 'pause', playing)
    expect(stepRecording(paused.phase, 'play', playing)).toEqual({
      phase: 'recording',
      take: 'begin'
    })
  })

  it('punches out from the button without stopping the player', () => {
    expect(stepRecording('recording', 'toggle', playing)).toEqual({
      phase: 'off',
      take: 'finish'
    })
  })
})

describe('events that change nothing', () => {
  const phases: RecordPhase[] = ['off', 'armed', 'recording']

  it('leaves an unarmed transport alone', () => {
    expect(stepRecording('off', 'play', stopped)).toEqual({ phase: 'off', take: null })
    expect(stepRecording('off', 'pause', playing)).toEqual({ phase: 'off', take: null })
    expect(stepRecording('off', 'stop', playing)).toEqual({ phase: 'off', take: null })
  })

  it('never begins a take twice over', () => {
    expect(stepRecording('recording', 'play', playing)).toEqual({
      phase: 'recording',
      take: null
    })
  })

  it('always disarms on stop, whatever it was doing', () => {
    for (const phase of phases) expect(stepRecording(phase, 'stop', playing).phase).toBe('off')
  })
})

describe('the timeline', () => {
  it('stays open from the moment recording is armed', () => {
    /* Recording the first channel of an empty song means playing past an end
       that has not been written yet. */
    expect(timelineIsOpen('armed')).toBe(true)
    expect(timelineIsOpen('recording')).toBe(true)
    expect(timelineIsOpen('off')).toBe(false)
  })
})
