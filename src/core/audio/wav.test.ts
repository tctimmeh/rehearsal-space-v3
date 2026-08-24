import { describe, expect, it } from 'vitest'

import { encodeWav } from './wav'

const text = (bytes: Uint8Array, at: number, length: number): string =>
  String.fromCharCode(...bytes.slice(at, at + length))

const view = (bytes: Uint8Array): DataView => new DataView(bytes.buffer)

const ramp = (length: number, scale = 1): Float32Array =>
  Float32Array.from({ length }, (_, index) => (index / length) * scale)

describe('encodeWav', () => {
  it('writes something a reader will recognise as a WAV', () => {
    const bytes = encodeWav([ramp(8)], 44100)

    expect(text(bytes, 0, 4)).toBe('RIFF')
    expect(text(bytes, 8, 4)).toBe('WAVE')
    expect(text(bytes, 12, 4)).toBe('fmt ')
    expect(text(bytes, 36, 4)).toBe('data')
  })

  it('describes the audio it actually holds', () => {
    const bytes = encodeWav([ramp(10), ramp(10)], 48000)
    const header = view(bytes)

    expect(header.getUint16(22, true)).toBe(2)
    expect(header.getUint32(24, true)).toBe(48000)
    expect(header.getUint16(34, true)).toBe(32)
    /* Ten frames of two channels, four bytes each. */
    expect(header.getUint32(40, true)).toBe(80)
    expect(bytes.length).toBe(44 + 80)
  })

  it('states its own length correctly, or players read past the end', () => {
    const bytes = encodeWav([ramp(64)], 44100)
    expect(view(bytes).getUint32(4, true)).toBe(bytes.length - 8)
  })

  it('gives the samples back unchanged', () => {
    const samples = Float32Array.from([0, 0.5, -0.5, 1, -1])
    const bytes = encodeWav([samples], 44100)
    const header = view(bytes)

    for (let index = 0; index < samples.length; index += 1) {
      expect(header.getFloat32(44 + index * 4, true)).toBeCloseTo(samples[index] as number, 6)
    }
  })

  it('interleaves the channels, which is not how they arrive', () => {
    const left = Float32Array.from([1, 3, 5])
    const right = Float32Array.from([2, 4, 6])
    const header = view(encodeWav([left, right], 44100))

    const written = Array.from({ length: 6 }, (_, i) => header.getFloat32(44 + i * 4, true))
    expect(written).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('does not round the samples on the way out', () => {
    /* Above full scale, which a raw take can be and a mix will fix. */
    const bytes = encodeWav([Float32Array.from([1.8])], 44100)
    expect(view(bytes).getFloat32(44, true)).toBeCloseTo(1.8, 6)
  })

  it('copes with a recording that captured nothing', () => {
    const bytes = encodeWav([new Float32Array(0)], 44100)
    expect(bytes.length).toBe(44)
    expect(view(bytes).getUint32(40, true)).toBe(0)
  })
})
