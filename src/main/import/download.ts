import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ytDlpProgress } from '@core/jobs/progress'
import type { AudioChannel } from '@core/song/song'
import { jobs } from '../jobs'
import { requireTool } from '../tools'
import { importAudio } from './importAudio'

/**
 * Fetches the audio behind a URL and brings it in as a channel.
 *
 * Two jobs rather than one, because they are two things: a download that
 * depends on somebody else's server, and a conversion that does not. When the
 * network is slow, "Downloading" is the useful thing to be told.
 *
 * The file is named after the title, so the channel and the file in the song
 * folder are too, rather than a video id.
 */
export async function downloadAudio(
  songDirectory: string,
  url: string,
  takenIds: string[]
): Promise<AudioChannel> {
  const ytDlp = await requireTool('yt-dlp')
  const workspace = await mkdtemp(join(tmpdir(), 'rehearsal-download-'))

  try {
    await jobs.run({
      title: 'Downloading',
      detail: url,
      subject: 'music',
      steps: [
        {
          command: ytDlp,
          args: [
            '--newline',
            '--no-playlist',
            '-f',
            'bestaudio/best',
            '-o',
            join(workspace, '%(title)s.%(ext)s'),
            url
          ],
          progress: ytDlpProgress()
        }
      ]
    })

    const [file] = await readdir(workspace)
    if (file === undefined) throw new Error('The download produced no audio file.')

    return await importAudio({
      songDirectory,
      sourcePath: join(workspace, file),
      takenIds,
      origin: { type: 'download', url }
    })
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}
