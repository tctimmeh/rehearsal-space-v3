import { describe, expect, it } from 'vitest'

import { planConversion } from './importAudio'

const plan = (channels: number) =>
  planConversion({
    ffmpeg: '/tools/ffmpeg',
    songDirectory: '/songs/coast-road',
    sourcePath: '/tmp/take.wav',
    id: 'Take 1',
    name: 'Take 1',
    subject: 'other',
    origin: { type: 'record' },
    durationSeconds: 30,
    channels
  })

/** The value ffmpeg is told to write, which is the `-ac` of the first step. */
const written = (channels: number): string | undefined => {
  const args = plan(channels).steps[0]?.args ?? []
  return args[args.indexOf('-ac') + 1]
}

describe('how many channels a conversion writes', () => {
  /*
   * A take comes from one socket and is mono. Written as stereo it was the
   * same signal twice — twice the file, nothing more to hear, and a track that
   * turns up in a DAW as a stereo pair somebody has to fold back down.
   */
  it('keeps a mono source mono', () => {
    expect(written(1)).toBe('1')
  })

  it('keeps a stereo source stereo', () => {
    expect(written(2)).toBe('2')
  })

  /* Whatever a file claims, it has to be worth at least one channel. */
  it('writes something for a source that claims none', () => {
    expect(written(0)).toBe('1')
  })

  /*
   * The waveform is one line however many channels play it, so the pass that
   * reads the audio back for the peaks folds it down regardless.
   */
  it('still reads the waveform back as one channel', () => {
    const args = plan(2).steps[1]?.args ?? []
    expect(args[args.indexOf('-ac') + 1]).toBe('1')
  })
})
