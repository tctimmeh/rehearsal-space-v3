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
 * Both ends are placed by eye against the waveform, and the tempo is nudged to
 * whatever divides the span between them evenly — so the first click lands on
 * the start and the last beat finishes on the end, wherever they are.
 */
export interface MetronomeChannel extends ChannelBase {
  kind: 'metronome'
  sample: MetronomeSample
  startTime: number
  /** Where the music picks the beat back up: the last beat finishes here. */
  endTime: number
  /** Approximate. It decides how many beats fit; the exact tempo follows. */
  bpm: number
  beatsPerMeasure: number
  accentFirstBeat: boolean
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
  /** What key the song is in, for the chord chart to open on. */
  key: SongKey
  /**
   * The stretch being worked on, kept with the song because that is what it is
   * about — the awkward eight bars are still awkward tomorrow. Whether the
   * player is currently going round it is not kept: that is a thing you are
   * doing, not a thing the song is.
   */
  loop: LoopRegion | null
  /** The user's own words for what this song is: "gig", "half finished". */
  tags: string[]
  /** Song-scoped tools reopen where you left them. */
  openTools: ToolId[]
}

/** Both ends in song time, so a region may begin before 00:00 in a count-in. */
export interface LoopRegion {
  start: number
  end: number
}

export interface SongKey {
  tonic: string
  mode: 'major' | 'minor'
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
  tags: string[]
}

export const DEFAULT_SONG_TITLE = 'New Song'

export const METRONOME_SAMPLES: readonly MetronomeSample[] = [
  'tick',
  'chirp',
  'cymbal',
  'rim',
  'kit'
]

export const isMetronomeSample = (value: unknown): value is MetronomeSample =>
  typeof value === 'string' && (METRONOME_SAMPLES as readonly string[]).includes(value)

export const METRONOME_SAMPLE_LABEL: Record<MetronomeSample, string> = {
  tick: 'Tick',
  chirp: 'Chirp',
  cymbal: 'Cymbal',
  rim: 'Rim',
  kit: 'Thud'
}

/**
 * A count-in: one bar of four, finishing where the music starts. Anchored at
 * the end, so it sits before 00:00 and the band comes in on the downbeat.
 */
export function newMetronomeChannel(id: string, endTime = 0): MetronomeChannel {
  return {
    kind: 'metronome',
    id,
    name: 'Count-in',
    subject: 'metronome',
    gain: 1,
    muted: false,
    soloed: false,
    sample: 'tick',
    /* One bar of four at 120, finishing where the music starts. */
    startTime: endTime - 2,
    endTime,
    bpm: 120,
    beatsPerMeasure: 4,
    accentFirstBeat: true
  }
}

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
    /* Music at unity; the click deliberately lower, because a count-in set
       right for headphones is usually too loud in a room. */
    buses: { music: 1, click: 0.5 },
    playback: { speed: 1, pitch: { semitones: 0, cents: 0 } },
    key: { tonic: 'C', mode: 'major' },
    loop: null,
    tags: [],
    openTools: []
  }
}

export const summarise = (song: Song, hasLyrics: boolean): SongSummary => ({
  id: song.id,
  title: song.title,
  artist: song.artist,
  channelCount: song.channels.length,
  hasLyrics,
  tags: song.tags
})
