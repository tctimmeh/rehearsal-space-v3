import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export interface AudioInfo {
  durationSeconds: number
  sampleRate: number
  channels: number
}

const PROBE_TIMEOUT_MS = 30000

/**
 * ffmpeg needs the duration to report progress as a fraction, and the channel
 * needs it to know where it ends on the timeline.
 */
export async function probeAudio(ffprobe: string, path: string): Promise<AudioInfo> {
  const { stdout } = await run(
    ffprobe,
    [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'format=duration:stream=sample_rate,channels',
      '-of', 'json',
      path
    ],
    { timeout: PROBE_TIMEOUT_MS }
  )

  const parsed: unknown = JSON.parse(stdout)
  const record = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  const format = (record['format'] ?? {}) as Record<string, unknown>
  const stream = (Array.isArray(record['streams']) ? (record['streams'][0] ?? {}) : {}) as Record<
    string,
    unknown
  >

  const duration = Number(format['duration'])
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('That file does not contain audio this app can read.')
  }

  return {
    durationSeconds: duration,
    sampleRate: Number(stream['sample_rate']) || 44100,
    channels: Number(stream['channels']) || 2
  }
}
