import type { PeakData, PeakLevel } from './peaks'

/** "RSPK", so a stray file identifies itself. */
const MAGIC = 0x5253504b
const VERSION = 1
const HEADER_BYTES = 14
const LEVEL_ENTRY_BYTES = 8

export class UnreadablePeaksError extends Error {}

export function encodePeaks({ sampleRate, levels }: PeakData): Uint8Array {
  const directoryBytes = HEADER_BYTES + levels.length * LEVEL_ENTRY_BYTES
  const total = levels.reduce((sum, level) => sum + level.data.length * 2, directoryBytes)

  const bytes = new Uint8Array(total)
  const view = new DataView(bytes.buffer)

  view.setUint32(0, MAGIC)
  view.setUint16(4, VERSION)
  view.setUint32(6, sampleRate)
  view.setUint32(10, levels.length)

  let offset = directoryBytes
  levels.forEach((level, index) => {
    const entry = HEADER_BYTES + index * LEVEL_ENTRY_BYTES
    view.setUint32(entry, level.samplesPerPeak)
    view.setUint32(entry + 4, level.data.length / 2)
    for (let index = 0; index < level.data.length; index += 1) {
      view.setInt16(offset + index * 2, level.data[index] ?? 0)
    }
    offset += level.data.length * 2
  })

  return bytes
}

export function decodePeaks(bytes: Uint8Array): PeakData {
  if (bytes.length < HEADER_BYTES) throw new UnreadablePeaksError('Peak file is too short')

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0) !== MAGIC) throw new UnreadablePeaksError('Not a peak file')
  const version = view.getUint16(4)
  if (version !== VERSION) {
    throw new UnreadablePeaksError(`Peak file version ${version} is not readable`)
  }

  const sampleRate = view.getUint32(6)
  const levelCount = view.getUint32(10)
  const levels: PeakLevel[] = []
  let offset = HEADER_BYTES + levelCount * LEVEL_ENTRY_BYTES

  for (let index = 0; index < levelCount; index += 1) {
    const entry = HEADER_BYTES + index * LEVEL_ENTRY_BYTES
    const samplesPerPeak = view.getUint32(entry)
    const peakCount = view.getUint32(entry + 4)
    const values = peakCount * 2
    if (offset + values * 2 > bytes.length) throw new UnreadablePeaksError('Peak file is truncated')
    const data = new Int16Array(values)
    for (let index = 0; index < values; index += 1) {
      data[index] = view.getInt16(offset + index * 2)
    }
    levels.push({ samplesPerPeak, data })
    offset += values * 2
  }

  return { sampleRate, levels }
}
