import type { ToolId } from '../tools'
import type { ChannelSubject, InstrumentSubject } from './channelSubject'

export type { InstrumentSubject }

export const SONG_SCHEMA_VERSION = 1

export interface ChannelBase {
  id: string
  name: string
  subject: ChannelSubject
  gain: number
  muted: boolean
  soloed: boolean
}

export type ChannelOrigin =
  | { type: 'import'; sourcePath: string }
  | { type: 'download'; url: string }
  | { type: 'record' }
  | { type: 'stem'; fromChannelId: string; model: string }

export interface AudioChannel extends ChannelBase {
  kind: 'audio'
  /** Relative to the song directory, e.g. `audio/bass_take2.ogg`. */
  file: string
  /** Where the channel sits on the song timeline; 0 for a full-length track. */
  startTime: number
  duration: number
  origin: ChannelOrigin
}

export type MetronomeSample = 'tick' | 'chirp' | 'cymbal' | 'rim' | 'kit'

/**
 * A metronome channel is always anchored at its end time — the point where the
 * music picks the beat back up — and its start is derived.
 */
export type MetronomeDuration =
  | { mode: 'measures'; bpm: number; measures: number; beatsPerMeasure: number }
  | { mode: 'startTime'; approxBpm: number; startTime: number }

export interface MetronomeChannel extends ChannelBase {
  kind: 'metronome'
  sample: MetronomeSample
  endTime: number
  accentFirstBeat: boolean
  duration: MetronomeDuration
}

export type Channel = AudioChannel | MetronomeChannel

export interface Song {
  schemaVersion: number
  /** Also the song's directory name inside the library. */
  id: string
  title: string
  artist: string
  createdAt: string
  updatedAt: string
  channels: Channel[]
  buses: { music: number; click: number }
  playback: { speed: number; pitch: PitchOffset }
  /** Song-scoped tools reopen where you left them. */
  openTools: ToolId[]
}

/**
 * Pitch is kept as a whole semitone plus a cent offset rather than one
 * fractional number, so the two controls stay independent: nudging cents can
 * never renumber the semitone the user set.
 */
export interface PitchOffset {
  semitones: number
  cents: number
}

/** What the audio engine shifts by: semitones, cents folded in. */
export const totalSemitones = (pitch: PitchOffset): number => pitch.semitones + pitch.cents / 100

export interface SongSummary {
  id: string
  title: string
  artist: string
  channelCount: number
  hasLyrics: boolean
}

export const DEFAULT_SONG_TITLE = 'New Song'

export function newSong(id: string, now = new Date()): Song {
  const timestamp = now.toISOString()
  return {
    schemaVersion: SONG_SCHEMA_VERSION,
    id,
    title: DEFAULT_SONG_TITLE,
    artist: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    channels: [],
    buses: { music: 0.84, click: 0.5 },
    playback: { speed: 1, pitch: { semitones: 0, cents: 0 } },
    openTools: []
  }
}

export const summarise = (song: Song, hasLyrics: boolean): SongSummary => ({
  id: song.id,
  title: song.title,
  artist: song.artist,
  channelCount: song.channels.length,
  hasLyrics
})
