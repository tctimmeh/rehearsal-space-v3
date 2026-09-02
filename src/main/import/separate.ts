import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'

import { demucsProgress } from '@core/jobs/progress'
import { guessSubject } from '@core/song/guessSubject'
import { uniqueSlug } from '@core/song/slug'
import type { AudioChannel } from '@core/song/song'
import { stemsOf, type SeparateRequest } from '../../shared/stems'
import { jobs } from '../jobs'
import { requireTool } from '../tools'
import { placedLike, sourceLength } from '@core/song/trim'
import { ensureSongFolders, planConversion, takenStems } from './importAudio'

/** Roughly how much of the work is the separation itself, against converting. */
const SEPARATION_WEIGHT = 12

/**
 * Splits a channel into its instruments and brings the chosen ones back in.
 *
 * demucs writes `<out>/<model>/<track>/<stem>.wav`, which is predictable, so
 * every conversion can be planned before anything runs and the whole thing —
 * the separation and one conversion per stem — reports as a single job. Seven
 * lines in the queue for one press of a button would be no use to anybody.
 */
export async function separateStems(
  songDirectory: string,
  source: AudioChannel,
  { model, stems, muteSource }: SeparateRequest
): Promise<AudioChannel[]> {
  const demucs = await requireTool('demucs')
  const ffmpeg = await requireTool('ffmpeg')
  await ensureSongFolders(songDirectory)

  const wanted = stems.filter((stem) => stemsOf(model).includes(stem))
  if (wanted.length === 0) return []

  const workspace = await mkdtemp(join(tmpdir(), 'rehearsal-stems-'))
  const sourcePath = join(songDirectory, source.file)
  const separatedIn = join(workspace, model, parse(source.file).name)

  try {
    const taken = await takenStems(songDirectory, [])
    const plans = wanted.map((stem) => {
      const id = uniqueSlug(`${parse(source.file).name} ${stem}`, taken)
      taken.push(id)
      /* Separation is given the whole file, so a stem's file is as long as the
         source's file — trim and all. Where it stands, and which part of it
         plays, are then the source's own, applied below. */
      const plan = planConversion({
        ffmpeg,
        songDirectory,
        sourcePath: join(separatedIn, `${stem}.wav`),
        id,
        name: stemLabel(stem),
        subject: guessSubject(stem),
        origin: { type: 'stem', fromChannelId: source.id, model },
        durationSeconds: sourceLength(source)
      })
      return { ...plan, channel: placedLike(source, plan.channel) }
    })

    await jobs.run({
      title: 'Separating',
      detail: `${source.name} · ${model}`,
      subject: source.subject,
      steps: [
        {
          command: demucs,
          args: ['-n', model, '-o', workspace, sourcePath],
          progress: demucsProgress(),
          weight: SEPARATION_WEIGHT
        },
        ...plans.flatMap((plan) => plan.steps)
      ]
    })

    await Promise.all(plans.map((plan) => plan.finish()))
    return plans.map((plan) => plan.channel)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

const stemLabel = (stem: string): string => stem.charAt(0).toUpperCase() + stem.slice(1)
