import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join, parse } from 'node:path'

import { ffmpegProgress } from '@core/jobs/progress'
import { encodePeaks } from '@core/peaks/format'
import { PeakBuilder } from '@core/peaks/peaks'
import { audioFileStem } from '@core/song/fileName'
import { guessSubject, nameFromFile } from '@core/song/guessSubject'
import { uniqueSlug } from '@core/song/slug'
import type { AudioChannel, ChannelOrigin, InstrumentSubject } from '@core/song/song'
import { jobs } from '../jobs'
import { requireTool } from '../tools'
import { probeAudio } from './probe'

/** Small enough to scrub smoothly, good enough to practise against. */
const OGG_QUALITY = '5'
const TARGET_SAMPLE_RATE = '44100'

export const AUDIO_EXTENSIONS = [
  'wav', 'flac', 'aiff', 'aif', 'mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wma', 'webm', 'mp4'
]

export interface ImportRequest {
  songDirectory: string
  sourcePath: string
  /** Channel ids already in use, so a repeated import gets its own name. */
  takenIds?: string[]
  origin?: ChannelOrigin
  /** Overrides the name and subject taken from the file name. */
  name?: string
  subject?: InstrumentSubject
}

/**
 * Converts a file into the song's own audio directory and builds its waveform,
 * as one job: two processes, but one piece of work as far as anyone watching
 * is concerned.
 */
export async function importAudio({
  songDirectory,
  sourcePath,
  takenIds = [],
  origin,
  name,
  subject
}: ImportRequest): Promise<AudioChannel> {
  const ffmpeg = await requireTool('ffmpeg')
  const ffprobe = await requireTool('ffprobe')

  const info = await probeAudio(ffprobe, sourcePath)
  await mkdir(join(songDirectory, 'audio'), { recursive: true })
  await mkdir(join(songDirectory, 'peaks'), { recursive: true })

  /* The file keeps its name, so the song folder reads like what went into it.
     Dedupe against what is already there as well as against the song's
     channels, so an orphaned file can never be written over. */
  const onDisk = (await readdir(join(songDirectory, 'audio'))).map((entry) => parse(entry).name)
  const id = uniqueSlug(audioFileStem(sourcePath), [...takenIds, ...onDisk])
  const audioPath = join(songDirectory, 'audio', `${id}.ogg`)
  const peaksPath = join(songDirectory, 'peaks', `${id}.peaks`)

  const builder = new PeakBuilder()
  /* Audio arrives in chunks that need not align to a sample. */
  let remainder: Buffer = Buffer.alloc(0)

  const takeSamples = (chunk: Buffer): void => {
    const data = remainder.length === 0 ? chunk : Buffer.concat([remainder, chunk])
    const usable = data.length - (data.length % Float32Array.BYTES_PER_ELEMENT)
    remainder = Buffer.from(data.subarray(usable))
    if (usable === 0) return
    const samples = new Float32Array(usable / Float32Array.BYTES_PER_ELEMENT)
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = data.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT)
    }
    builder.push(samples)
  }

  await jobs.run({
    title: 'Importing',
    detail: `${nameFromFile(sourcePath)} → ogg`,
    subject: subject ?? guessSubject(sourcePath),
    steps: [
      {
        command: ffmpeg,
        args: [
          '-hide_banner', '-loglevel', 'error', '-nostats',
          '-progress', 'pipe:1',
          '-i', sourcePath,
          '-vn',
          '-ar', TARGET_SAMPLE_RATE,
          '-ac', '2',
          '-c:a', 'libvorbis',
          '-q:a', OGG_QUALITY,
          audioPath,
          '-y'
        ],
        progress: ffmpegProgress(info.durationSeconds),
        weight: 3
      },
      {
        /* Raw audio on stdout, so progress has to come out of stderr instead. */
        command: ffmpeg,
        args: [
          '-hide_banner', '-loglevel', 'error', '-nostats',
          '-progress', 'pipe:2',
          '-i', audioPath,
          '-ac', '1',
          '-f', 'f32le',
          '-'
        ],
        progress: ffmpegProgress(info.durationSeconds),
        onData: takeSamples,
        weight: 1
      }
    ]
  })

  await writeFile(peaksPath, encodePeaks(builder.finish(Number(TARGET_SAMPLE_RATE))))

  return {
    kind: 'audio',
    id,
    name: name ?? nameFromFile(sourcePath),
    subject: subject ?? guessSubject(sourcePath),
    file: join('audio', `${id}.ogg`),
    startTime: 0,
    duration: info.durationSeconds,
    /* Unity: an imported file plays at the level it arrived at. */
    gain: 1,
    muted: false,
    soloed: false,
    origin: origin ?? { type: 'import', sourcePath }
  }
}
