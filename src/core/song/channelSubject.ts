/**
 * Channel identity is locked: every subject has exactly one colour and one icon,
 * used identically in the mixer, the setup list and the stems dialog.
 * Colour follows instrument family so related channels sit together.
 */
export const CHANNEL_SUBJECTS = [
  'music',
  'vocals',
  'guitar',
  'electric',
  'acoustic',
  'bass',
  'drums',
  'piano',
  'synth',
  'other',
  'metronome',
  'lyrics'
] as const

export type ChannelSubject = (typeof CHANNEL_SUBJECTS)[number]

/**
 * Metronome and lyrics are kinds of channel, not things anyone plays. They
 * carry an identity so their channels look like themselves in the mixer, but
 * they are never offered as an instrument for a piece of audio.
 */
export const NON_INSTRUMENT_SUBJECTS = ['metronome', 'lyrics'] as const

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
  electric: '#f472b6',
  acoustic: '#eab54a',
  bass: '#60a5fa',
  drums: '#4ade80',
  piano: '#a78bfa',
  synth: '#22d3ee',
  other: '#b08968',
  metronome: '#8b95a5',
  lyrics: '#2dd4bf'
}

export const CHANNEL_SUBJECT_LABEL: Record<ChannelSubject, string> = {
  music: 'Music (full mix)',
  vocals: 'Vocals',
  guitar: 'Guitar',
  electric: 'Electric guitar',
  acoustic: 'Acoustic guitar',
  bass: 'Bass guitar',
  drums: 'Drums',
  piano: 'Piano',
  synth: 'Synth',
  other: 'Other / unknown',
  metronome: 'Metronome',
  lyrics: 'Lyrics'
}
