import { isToolId, type ToolId } from '../tools'
import { CHANNEL_SUBJECTS, type ChannelSubject } from './channelSubject'
import {
  METRONOME_SAMPLES,
  newSong,
  SONG_SCHEMA_VERSION,
  type Channel,
  type ChannelOrigin,
  type PitchOffset,
  type Song
} from './song'

export class UnreadableSongError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const str = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

const clamped = (value: unknown, fallback: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, num(value, fallback)))

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback


const SEMITONE_LIMIT = 12
const CENT_LIMIT = 50

/**
 * Earlier songs stored pitch as one possibly-fractional semitone count. Split
 * it, so a song saved before the cents control existed still opens correctly.
 */
function parsePitch(raw: unknown): PitchOffset {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const total = Math.min(SEMITONE_LIMIT, Math.max(-SEMITONE_LIMIT, raw))
    const semitones = Math.trunc(total)
    return { semitones, cents: Math.round((total - semitones) * 100) }
  }
  if (!isRecord(raw)) return { semitones: 0, cents: 0 }
  return {
    semitones: Math.round(clamped(raw['semitones'], 0, -SEMITONE_LIMIT, SEMITONE_LIMIT)),
    cents: Math.round(clamped(raw['cents'], 0, -CENT_LIMIT, CENT_LIMIT))
  }
}

function parseOrigin(raw: unknown): ChannelOrigin {
  if (!isRecord(raw)) return { type: 'import', sourcePath: '' }
  switch (raw['type']) {
    case 'download':
      return { type: 'download', url: str(raw['url'], '') }
    case 'record':
      return { type: 'record' }
    case 'stem':
      return {
        type: 'stem',
        fromChannelId: str(raw['fromChannelId'], ''),
        model: str(raw['model'], '')
      }
    default:
      return { type: 'import', sourcePath: str(raw['sourcePath'], '') }
  }
}

/**
 * Older songs described a metronome's length one of two ways, both anchored at
 * the end. Both reduce to a pair of times, which is all the channel keeps now:
 * a count of measures at a tempo is simply a start time worked backwards.
 */
function parseSpan(raw: Record<string, unknown>): { startTime: number; bpm: number } {
  const endTime = num(raw['endTime'], 0)
  const legacy = isRecord(raw['duration']) ? raw['duration'] : null

  if (legacy === null) {
    return { startTime: num(raw['startTime'], endTime - 2), bpm: num(raw['bpm'], 120) }
  }

  if (legacy['mode'] === 'startTime') {
    return {
      startTime: num(legacy['startTime'], endTime - 2),
      bpm: num(legacy['approxBpm'], 120)
    }
  }

  const bpm = num(legacy['bpm'], 120)
  const measures = Math.max(1, Math.round(num(legacy['measures'], 1)))
  const beatsPerMeasure = Math.max(
    1,
    Math.round(num(raw['beatsPerMeasure'], num(legacy['beatsPerMeasure'], 4)))
  )
  return { startTime: endTime - (measures * beatsPerMeasure * 60) / (bpm || 120), bpm }
}

function parseChannel(raw: unknown, index: number): Channel | null {
  if (!isRecord(raw)) return null

  const base = {
    id: str(raw['id'], `channel-${index}`),
    name: str(raw['name'], 'Channel'),
    subject: oneOf<ChannelSubject>(raw['subject'], CHANNEL_SUBJECTS, 'other'),
    gain: clamped(raw['gain'], 1, 0, 1),
    muted: bool(raw['muted'], false),
    soloed: bool(raw['soloed'], false)
  }

  if (raw['kind'] === 'metronome') {
    const span = parseSpan(raw)
    return {
      ...base,
      kind: 'metronome',
      sample: oneOf(raw['sample'], METRONOME_SAMPLES, 'tick'),
      startTime: span.startTime,
      endTime: num(raw['endTime'], 0),
      bpm: span.bpm,
      /* Older songs kept this inside the measures mode, where it did not
         belong: how many beats to a measure is a property of the music, not of
         how the channel's length happens to be worked out. */
      beatsPerMeasure: Math.max(
        1,
        Math.round(
          num(
            raw['beatsPerMeasure'],
            num(isRecord(raw['duration']) ? raw['duration']['beatsPerMeasure'] : undefined, 4)
          )
        )
      ),
      accentFirstBeat: bool(raw['accentFirstBeat'], true)
    }
  }

  const file = str(raw['file'], '')
  if (file === '') return null

  return {
    ...base,
    kind: 'audio',
    file,
    startTime: num(raw['startTime'], 0),
    duration: Math.max(0, num(raw['duration'], 0)),
    origin: parseOrigin(raw['origin'])
  }
}

/**
 * song.json is a plain file in a folder the user can open, so it may be
 * hand-edited, half-written, or from a future version. Every field is parsed
 * with a fallback rather than trusted; only a version we cannot understand is
 * an error.
 */
export function migrateSong(raw: unknown, id: string): Song {
  const defaults = newSong(id)
  if (!isRecord(raw)) return defaults

  const version = num(raw['schemaVersion'], SONG_SCHEMA_VERSION)
  if (version > SONG_SCHEMA_VERSION) {
    throw new UnreadableSongError(
      `"${id}" was written by a newer version of Rehearsal Space (song format ${version}).`
    )
  }

  const buses = isRecord(raw['buses']) ? raw['buses'] : {}
  const playback = isRecord(raw['playback']) ? raw['playback'] : {}
  const channels = Array.isArray(raw['channels']) ? raw['channels'] : []
  const openTools = Array.isArray(raw['openTools']) ? raw['openTools'] : []

  return {
    schemaVersion: SONG_SCHEMA_VERSION,
    /* The directory is the identity; a stale id inside the file loses. */
    id,
    title: str(raw['title'], defaults.title),
    artist: str(raw['artist'], defaults.artist),
    createdAt: str(raw['createdAt'], defaults.createdAt),
    updatedAt: str(raw['updatedAt'], defaults.updatedAt),
    channels: channels
      .map((channel, index) => parseChannel(channel, index))
      .filter((channel): channel is Channel => channel !== null),
    buses: {
      music: clamped(buses['music'], defaults.buses.music, 0, 1),
      click: clamped(buses['click'], defaults.buses.click, 0, 1)
    },
    playback: {
      speed: clamped(playback['speed'], 1, 0.5, 1.5),
      pitch: parsePitch(playback['pitch'])
    },
    openTools: openTools.filter((tool): tool is ToolId => isToolId(tool))
  }
}
