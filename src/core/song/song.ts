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
  /** Where the kept part sits on the song timeline; 0 for a full-length track. */
  startTime: number
  /** How long the kept part is. */
  duration: number
  /**
   * Seconds into the file where the kept part begins.
   *
   * Trimming takes nothing away from the file: it says which part of it to
   * play, so the rest is still there to be let back in. Absent means from the
   * beginning, which is what an untrimmed channel is.
   */
  offset?: number
  /**
   * How long the file itself is, which is what trimming has to stay inside.
   *
   * Absent on a channel written before trimming existed, which is untrimmed by
   * definition, so its file is as long as it plays for.
   */
  sourceDuration?: number
  origin: ChannelOrigin
}

export type MetronomeSample =
  | 'beep'
  | 'block'
  | 'woodblock'
  | 'hat'
  | 'hatOpen'
  | 'kick'
  | 'snare'
  | 'kickSnare'
  | 'sticks'

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
   * player is currently looping it is not kept: that is a thing you are
   * doing, not a thing the song is.
   */
  loop: LoopRegion | null
  /** The user's own words for what this song is: "gig", "half finished". */
  tags: string[]
  /** Song-scoped tools reopen where you left them. */
  openTools: ToolId[]
  /**
   * The song's tablature, one entry per file.
   *
   * Listed here rather than found by reading the folder, the same way channels
   * are, so that the order and the names are the song's own rather than
   * whatever the filesystem happens to return.
   */
  tabs: TabFile[]
  /**
   * What the waveform tool was doing with this song, and to which channel.
   *
   * The zoom and pan are not here. They are worth remembering while the app is
   * open and not worth a file: panning would write one on every notch of the
   * wheel.
   */
  waveform: WaveformSettings
}

export interface TabFile {
  id: string
  /** Relative to the song directory, e.g. `tabs/lead.txt`. */
  file: string
  /** What it is called on screen: "Lead", "Rhythm", "Bass". */
  name: string
  /** Six for a guitar, four for a bass. Fixed for the whole file. */
  strings: number
}

export interface WaveformSettings {
  /** The channel being looked at, or null for whichever comes first. */
  channel: string | null
  /**
   * A second channel drawn underneath, to line the first one up against.
   *
   * Trimming and placing a take is done against something else — the take is
   * early or late compared to what it is played over — and comparing two
   * traces by memory is not comparing them.
   */
  against?: string | null
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
  /** What is in it, for the library to say so without opening it. */
  hasAudio: boolean
  hasLyrics: boolean
  hasTabs: boolean
  tags: string[]
}

export const DEFAULT_SONG_TITLE = 'New Song'

export const METRONOME_SAMPLES: readonly MetronomeSample[] = [
  'beep',
  'block',
  'woodblock',
  'hat',
  'hatOpen',
  'kick',
  'snare',
  'kickSnare',
  'sticks'
]

export const isMetronomeSample = (value: unknown): value is MetronomeSample =>
  typeof value === 'string' && (METRONOME_SAMPLES as readonly string[]).includes(value)

export const METRONOME_SAMPLE_LABEL: Record<MetronomeSample, string> = {
  beep: 'Beep',
  block: 'Block',
  woodblock: 'Woodblock',
  hat: 'Hi-hat',
  hatOpen: 'Hi-hat Open',
  kick: 'Kick',
  snare: 'Snare',
  kickSnare: 'Kick-Snare',
  sticks: 'Sticks'
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
    sample: 'beep',
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
    openTools: [],
    tabs: [],
    waveform: { channel: null, against: null }
  }
}

export const summarise = (song: Song, hasLyrics: boolean): SongSummary => ({
  id: song.id,
  title: song.title,
  artist: song.artist,
  channelCount: song.channels.length,
  /* A click track is not a recording of anything, so a song that has only one
     has nothing in it yet. */
  hasAudio: song.channels.some((channel) => channel.kind === 'audio'),
  hasLyrics,
  hasTabs: song.tabs.length > 0,
  tags: song.tags
})
