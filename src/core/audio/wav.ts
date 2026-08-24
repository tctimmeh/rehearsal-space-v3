/** WAVE_FORMAT_IEEE_FLOAT: samples stay as they were captured. */
const FORMAT_FLOAT = 3
const BITS_PER_SAMPLE = 32
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8
const HEADER_BYTES = 44

const ascii = (view: DataView, offset: number, text: string): void => {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index))
  }
}

/**
 * Wraps captured audio in a WAV container, as a handover format only: it goes
 * straight to ffmpeg, which converts it into the song like any other import.
 *
 * The samples are written as 32-bit floats rather than being quantised on the
 * way out. A recording that has not been mixed yet has no business being
 * rounded, and the file is deleted within seconds.
 */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number): Uint8Array {
  const channelCount = Math.max(1, channels.length)
  const frames = channels[0]?.length ?? 0
  const dataBytes = frames * channelCount * BYTES_PER_SAMPLE

  const bytes = new Uint8Array(HEADER_BYTES + dataBytes)
  const view = new DataView(bytes.buffer)

  ascii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(view, 8, 'WAVE')

  ascii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, FORMAT_FLOAT, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channelCount * BYTES_PER_SAMPLE, true)
  view.setUint16(32, channelCount * BYTES_PER_SAMPLE, true)
  view.setUint16(34, BITS_PER_SAMPLE, true)

  ascii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  /* Interleaved, which is what every reader expects and no capture produces. */
  let offset = HEADER_BYTES
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      view.setFloat32(offset, channels[channel]?.[frame] ?? 0, true)
      offset += BYTES_PER_SAMPLE
    }
  }

  return bytes
}
