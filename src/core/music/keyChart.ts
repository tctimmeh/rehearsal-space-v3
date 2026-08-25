import { Key, Note } from 'tonal'

import { writableChord } from './spelling'

export type Mode = 'major' | 'minor'

export interface ChordEntry {
  /** Roman numeral: I, ii, bVII. */
  degree: string
  /** The plain three-note chord, which is what most songs use. */
  triad: string
  /** The same chord with its seventh, for when the plain one is too plain. */
  seventh: string
}

export interface KeyChart {
  tonic: string
  mode: Mode
  /** "3 flats", "2 sharps", "no sharps or flats". */
  signature: string
  relative: { tonic: string; mode: Mode }
  parallel: { tonic: string; mode: Mode }
  diatonic: ChordEntry[]
  /** The same seven degrees in the parallel key, minus the ones already here. */
  borrowed: ChordEntry[]
  /**
   * The chord that leads to each degree as though that degree were home. The
   * one thing outside a key that songs reach for more than any other.
   */
  secondaryDominants: { degree: string; chord: string; leadsTo: string }[]
  /**
   * Minor keys only. Natural minor has no dominant seventh and no leading
   * note, which is why almost no song in a minor key stays in it.
   */
  fromHarmonicMinor: ChordEntry[]
}

/**
 * How a degree is written for a chord: upper case for major, lower for minor,
 * with the diminished mark where it belongs.
 *
 * tonal gives grades in upper case throughout, which loses the one thing the
 * numerals are read for at a glance.
 */
function numeral(grade: string, chord: string): string {
  const quality = chord.replace(/^[A-G](##|#|bb|b)?/, '')
  if (/^(m|min)/.test(quality) && !/^m(aj)/.test(quality)) return grade.toLowerCase()
  if (/^(o|dim)/.test(quality) || quality.startsWith('m7b5')) return `${grade.toLowerCase()}°`
  if (quality.startsWith('+') || quality.startsWith('aug')) return `${grade}+`
  return grade
}

/**
 * Chords are spelled as they would be written down. A key can land on C flat
 * or E sharp quite correctly, and the editor refuses to write either, so a
 * chart that did would disagree with the song beside it.
 */
const entries = (grades: string[], triads: string[], sevenths: string[]): ChordEntry[] =>
  triads.map((triad, index) => ({
    degree: numeral(grades[index] ?? '', triad),
    triad: writableChord(triad),
    seventh: writableChord(sevenths[index] ?? triad)
  }))

const majorEntries = (tonic: string): ChordEntry[] => {
  const key = Key.majorKey(tonic)
  return entries([...key.grades], [...key.triads], [...key.chords])
}

const minorEntries = (tonic: string): ChordEntry[] => {
  const key = Key.minorKey(tonic)
  return entries([...key.natural.grades], [...key.natural.triads], [...key.natural.chords])
}

const harmonicEntries = (tonic: string): ChordEntry[] => {
  const key = Key.minorKey(tonic)
  return entries([...key.harmonic.grades], [...key.harmonic.triads], [...key.harmonic.chords])
}

/** "no sharps or flats", "2 sharps", "3 flats". */
export function describeSignature(signature: string): string {
  if (signature === '') return 'no sharps or flats'
  const count = signature.length
  const kind = signature.startsWith('b') ? 'flat' : 'sharp'
  return `${count} ${kind}${count === 1 ? '' : 's'}`
}

const samePitch = (one: string, other: string): boolean =>
  Note.chroma(one.replace(/^([A-G](##|#|bb|b)?).*$/, '$1')) ===
    Note.chroma(other.replace(/^([A-G](##|#|bb|b)?).*$/, '$1')) &&
  one.replace(/^[A-G](##|#|bb|b)?/, '') === other.replace(/^[A-G](##|#|bb|b)?/, '')

export function keyChart(tonic: string, mode: Mode): KeyChart {
  const major = Key.majorKey(tonic)
  const minor = Key.minorKey(tonic)

  const diatonic = mode === 'major' ? majorEntries(tonic) : minorEntries(tonic)
  const parallelChords = mode === 'major' ? minorEntries(tonic) : majorEntries(tonic)
  const borrowed = parallelChords.filter(
    (candidate) => !diatonic.some((held) => samePitch(held.triad, candidate.triad))
  )

  const dominants =
    mode === 'major'
      ? [...major.secondaryDominants].map((chord, index) => ({
          chord: chord === '' ? '' : writableChord(chord),
          degree: major.grades[index] ?? '',
          leadsTo: writableChord(major.triads[index] ?? '')
        }))
      : [...minor.natural.triads].map((leadsTo, index) => ({
          chord: '',
          degree: minor.natural.grades[index] ?? '',
          leadsTo: writableChord(leadsTo)
        }))

  return {
    tonic,
    mode,
    signature: describeSignature(mode === 'major' ? major.keySignature : minor.keySignature),
    relative:
      mode === 'major'
        ? { tonic: major.minorRelative, mode: 'minor' }
        : { tonic: minor.relativeMajor, mode: 'major' },
    parallel: { tonic, mode: mode === 'major' ? 'minor' : 'major' },
    diatonic,
    borrowed,
    secondaryDominants: dominants.filter((entry) => entry.chord !== ''),
    fromHarmonicMinor:
      mode === 'minor'
        ? harmonicEntries(tonic).filter(
            (candidate) => !diatonic.some((held) => samePitch(held.triad, candidate.triad))
          )
        : []
  }
}

const PITCHES = 12

/**
 * The tonics offered, spelled the way the key is usually written.
 *
 * Every pitch can be spelled two ways and one of them is always ridiculous:
 * D sharp major needs nine sharps, two of them double. Whichever spelling
 * needs fewer accidentals is the one people write.
 */
export function tonicsFor(mode: Mode): string[] {
  const sharps = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const flats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

  return Array.from({ length: PITCHES }, (_, chroma) => {
    const sharp = sharps[chroma] as string
    const flat = flats[chroma] as string
    if (sharp === flat) return sharp

    const bySharps = accidentals(sharp, mode)
    const byFlats = accidentals(flat, mode)
    /* One pitch in each mode needs six either way, and convention has long
       since settled which one gets written: F sharp major, E flat minor. */
    if (bySharps === byFlats) return mode === 'major' ? sharp : flat
    return bySharps < byFlats ? sharp : flat
  })
}

function accidentals(tonic: string, mode: Mode): number {
  const signature =
    mode === 'major' ? Key.majorKey(tonic).keySignature : Key.minorKey(tonic).keySignature
  return signature.length
}
