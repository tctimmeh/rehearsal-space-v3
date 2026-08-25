import { Note } from 'tonal'

const ROOT = /^([A-G](?:#{1,2}|b{1,2})?)/

/** Correct, and never written: every chart spells these the other way. */
const UNWRITTEN = new Set(['E#', 'B#', 'Fb', 'Cb'])

/**
 * A note as it goes on a page.
 *
 * E sharp, C flat and anything with a double accidental are all correct — a
 * key or an interval can land on any of them — and no chart has ever said one.
 * They are swapped for the note that means the same thing and can be read.
 */
export function writableNote(note: string): string {
  if (!/##|bb/.test(note) && !UNWRITTEN.has(note)) return note
  const simpler = Note.enharmonic(note)
  return simpler === '' ? note : simpler
}

/** The same, for a whole chord symbol, bass note and all. */
export function writableChord(chord: string): string {
  return chord
    .split('/')
    .map((part) => {
      const root = ROOT.exec(part)?.[1]
      if (root === undefined) return part
      return writableNote(root) + part.slice(root.length)
    })
    .join('/')
}

/**
 * Chords as they are printed rather than as they are typed.
 *
 * Only accidentals become signs: a lower-case b is a flat after a note letter
 * and before an altered degree, and nothing anywhere else. Replacing every b
 * would turn Bm7b5 into a chord with no name at all.
 */
export function prettyChord(chord: string): string {
  return chord
    .replace(/([A-G])b/g, '$1♭')
    .replace(/b(\d)/g, '♭$1')
    .replaceAll('#', '♯')
}

/** `bVII` is a flattened seventh degree; `vii°` is already as written. */
export function prettyDegree(degree: string): string {
  return degree.replace(/^b/, '♭').replaceAll('#', '♯')
}
