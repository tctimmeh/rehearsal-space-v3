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
