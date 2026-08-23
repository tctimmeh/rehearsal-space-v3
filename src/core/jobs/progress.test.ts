import { describe, expect, it } from 'vitest'

import { demucsProgress, ffmpegProgress, ytDlpProgress } from './progress'

describe('ffmpegProgress', () => {
  const read = ffmpegProgress(240)

  it('reads the microsecond position against the known duration', () => {
    expect(read('out_time_us=120000000')).toBe(0.5)
    expect(read('out_time_us=0')).toBe(0)
  })

  it('falls back to the timecode when microseconds are absent', () => {
    expect(read('out_time=00:02:00.000000')).toBe(0.5)
    expect(read('out_time=01:00:00.000000')).toBe(1)
  })

  it('takes ffmpeg at its word when it says it has finished', () => {
    expect(read('progress=end')).toBe(1)
  })

  it('ignores the rest of the progress block', () => {
    expect(read('bitrate=  93.2kbits/s')).toBeNull()
    expect(read('progress=continue')).toBeNull()
    expect(read('')).toBeNull()
  })

  it('ignores the N/A values ffmpeg emits before the first frame lands', () => {
    expect(read('out_time_us=N/A')).toBeNull()
    expect(read('out_time=N/A')).toBeNull()
    expect(read('bitrate=N/A')).toBeNull()
  })

  it('reports nothing when the duration is unknown, rather than guessing', () => {
    expect(ffmpegProgress(0)('out_time_us=120000000')).toBeNull()
  })

  it('never exceeds 1, since the output can run past the input duration', () => {
    expect(read('out_time_us=999000000')).toBe(1)
  })
})

describe('ytDlpProgress', () => {
  const read = ytDlpProgress()

  it('reads the download percentage', () => {
    expect(read('[download]   4.2% of ~12.34MiB at 1.23MiB/s ETA 00:09')).toBeCloseTo(0.042)
    expect(read('[download] 100% of 12.34MiB in 00:10')).toBe(1)
  })

  it('ignores yt-dlp’s other chatter', () => {
    expect(read('[youtube] Extracting URL: https://example.com/watch?v=x')).toBeNull()
    expect(read('[download] Destination: track.webm')).toBeNull()
    expect(read('[ExtractAudio] Destination: track.opus')).toBeNull()
  })
})

describe('demucsProgress', () => {
  const read = demucsProgress()

  it('reads the tqdm bar', () => {
    expect(read(' 45%|████▌     | 45/100 [00:10<00:12,  4.5it/s]')).toBe(0.45)
    expect(read('100%|██████████| 100/100 [00:22<00:00,  4.5it/s]')).toBe(1)
  })

  it('ignores demucs’s other output', () => {
    expect(read('Separating track /tmp/full_mix.ogg')).toBeNull()
    expect(read('Selected model is a bag of 4 models.')).toBeNull()
  })
})
