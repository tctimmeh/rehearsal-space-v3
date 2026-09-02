import { DEFAULT_SUBJECT, type InstrumentSubject } from './channelSubject'

/**
 * Imported files and separated stems are usually named after what is on them.
 * Guessing saves the user a step, and the channel's subject is editable, so a
 * wrong guess costs nothing.
 *
 * Order matters: acoustic has to be looked for before plain guitar, or an
 * acoustic take is filed as a guitar and loses the distinction. An electric
 * one is a guitar — the words that say so are still looked for, because "dist"
 * and "el-gtr" name no guitar otherwise.
 */
const HINTS: [pattern: RegExp, subject: InstrumentSubject][] = [
  [/\b(full[\s_-]?mix|mix|master|backing|instrumental|song|track)\b/, 'music'],
  [/(vocal|vox|voice|sing|lead|harmon|choir|acapella)/, 'vocals'],
  [/(drum|perc|kick|snare|hat|cymbal|kit|beat)/, 'drums'],
  [/(bass|\bdi\b|sub)/, 'bass'],
  [/(acoustic|nylon|steel|\bac[\s_-]?gtr)/, 'acoustic'],
  [/(electric|\bel[\s_-]?gtr|\belec\b|dist|overdrive|crunch|guitar|gtr|riff)/, 'guitar'],
  [/(piano|keys|keyboard|rhodes|organ|wurli)/, 'piano'],
  [/(synth|pad|arp|lead[\s_-]?synth)/, 'synth'],
  /* Imported click tracks are audio like any other, but they are certainly not
     the full mix, so they must not land on the default. */
  [/(click|metronome|count[\s_-]?in|tempo)/, 'other'],
  /* demucs names its catch-all stem exactly this, so it must not fall through
     to the default and be taken for the full mix. */
  [/^other$/, 'other']
]

/** Takes a file name or a stem name; the extension and path are ignored. */
export function guessSubject(name: string): InstrumentSubject {
  const cleaned = name
    .replace(/^.*[/\\]/, '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .toLowerCase()

  for (const [pattern, subject] of HINTS) {
    if (pattern.test(cleaned)) return subject
  }
  return DEFAULT_SUBJECT
}

/** A channel name from a file name: no path, no extension, tidied separators. */
export function nameFromFile(path: string): string {
  const base = path
    .replace(/^.*[/\\]/, '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return base === '' ? 'Audio' : base.charAt(0).toUpperCase() + base.slice(1)
}
