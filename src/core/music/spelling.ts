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
