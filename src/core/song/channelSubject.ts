/**
 * Channel identity is locked: every subject has exactly one colour and one icon,
 * used identically in the mixer, the setup list and the stems dialog.
 * Colour follows instrument family so related channels sit together.
 */
export const CHANNEL_SUBJECTS = [
  'music',
  'vocals',
  'guitar',
  'acoustic',
  'bass',
  'drums',
  'piano',
  'synth',
  'other',
  'metronome'
] as const

export type ChannelSubject = (typeof CHANNEL_SUBJECTS)[number]

/**
 * The metronome is a kind of channel, not a thing anyone plays: the click has
 * an identity so its bus looks like itself in the mixer, but it is never
 * offered as an instrument for a piece of audio.
 */
export const NON_INSTRUMENT_SUBJECTS = ['metronome'] as const

export type InstrumentSubject = Exclude<
  ChannelSubject,
  (typeof NON_INSTRUMENT_SUBJECTS)[number]
>

export const INSTRUMENT_SUBJECTS = CHANNEL_SUBJECTS.filter(
  (subject): subject is InstrumentSubject =>
    !(NON_INSTRUMENT_SUBJECTS as readonly string[]).includes(subject)
)

/** What an import becomes when its name gives nothing away: most are full mixes. */
export const DEFAULT_SUBJECT: InstrumentSubject = 'music'

export const CHANNEL_SUBJECT_COLOR: Record<ChannelSubject, string> = {
  music: '#cbd5e1',
  vocals: '#ff9b5c',
  guitar: '#f472b6',
  acoustic: '#eab54a',
  bass: '#60a5fa',
  drums: '#4ade80',
  piano: '#a78bfa',
  synth: '#22d3ee',
  other: '#b08968',
  metronome: '#8b95a5'
}

export const CHANNEL_SUBJECT_LABEL: Record<ChannelSubject, string> = {
  music: 'Music (full mix)',
  vocals: 'Vocals',
  guitar: 'Guitar',
  acoustic: 'Acoustic guitar',
  bass: 'Bass guitar',
  drums: 'Drums',
  piano: 'Piano',
  synth: 'Synth',
  other: 'Other / unknown',
  metronome: 'Metronome'
}
