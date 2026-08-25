/**
 * Recording is armed rather than started.
 *
 * Pressing record and then play used to capture the gap in between, so a take
 * meant to be sung over the guitar began seconds before the guitar did and
 * every layer drifted. Arming instead means a take starts exactly when the
 * player does, and the two share one clock.
 */
export type RecordPhase = 'off' | 'armed' | 'recording'

/** What the machine does with the tape as a result of the event. */
export type TakeAction = 'begin' | 'finish' | null

export type RecordEvent = 'toggle' | 'play' | 'pause' | 'stop'

export interface RecordStep {
  phase: RecordPhase
  take: TakeAction
}

/**
 * How the record button and the transport act on each other.
 *
 * Stopping the player abandons the whole idea — it stops, it finishes the
 * take, and it disarms. Pausing only punches out: still armed, so carrying on
 * lays down another take from where the player resumes.
 */
export function stepRecording(
  phase: RecordPhase,
  event: RecordEvent,
  playing: boolean
): RecordStep {
  if (event === 'toggle') {
    if (phase === 'recording') return { phase: 'off', take: 'finish' }
    if (phase === 'armed') return { phase: 'off', take: null }
    /* Arming mid-song starts there and then: the player is already engaged. */
    return playing ? { phase: 'recording', take: 'begin' } : { phase: 'armed', take: null }
  }

  if (event === 'play') {
    return phase === 'armed' ? { phase: 'recording', take: 'begin' } : { phase, take: null }
  }

  if (event === 'pause') {
    return phase === 'recording' ? { phase: 'armed', take: 'finish' } : { phase, take: null }
  }

  return { phase: 'off', take: phase === 'recording' ? 'finish' : null }
}

/** The timeline must not end while a take is being laid down over it. */
export function timelineIsOpen(phase: RecordPhase): boolean {
  return phase !== 'off'
}
