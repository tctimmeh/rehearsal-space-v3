import { isToolId, type ToolId } from '../tools'
import { CHANNEL_SUBJECTS, type ChannelSubject } from './channelSubject'
import {
  newSong,
  SONG_SCHEMA_VERSION,
  type Channel,
  type ChannelOrigin,
  type MetronomeDuration,
  type MetronomeSample,
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

const METRONOME_SAMPLES: readonly MetronomeSample[] = ['tick', 'chirp', 'cymbal', 'rim', 'kit']

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

function parseDuration(raw: unknown): MetronomeDuration {
  if (isRecord(raw) && raw['mode'] === 'startTime') {
    return {
      mode: 'startTime',
      approxBpm: num(raw['approxBpm'], 120),
      startTime: num(raw['startTime'], 0)
    }
  }
  const record = isRecord(raw) ? raw : {}
  return {
    mode: 'measures',
    bpm: num(record['bpm'], 120),
    measures: Math.max(1, Math.round(num(record['measures'], 1))),
    beatsPerMeasure: Math.max(1, Math.round(num(record['beatsPerMeasure'], 4)))
  }
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
    return {
      ...base,
      kind: 'metronome',
      sample: oneOf(raw['sample'], METRONOME_SAMPLES, 'tick'),
      endTime: num(raw['endTime'], 0),
      accentFirstBeat: bool(raw['accentFirstBeat'], true),
      duration: parseDuration(raw['duration'])
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
      pitch: clamped(playback['pitch'], 0, -12, 12)
    },
    openTools: openTools.filter((tool): tool is ToolId => isToolId(tool))
  }
}
