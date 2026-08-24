import type { ChannelSubject } from './channelSubject'

/**
 * Imported files and separated stems are usually named after what is on them.
 * Guessing saves the user a step, and the channel's subject is editable, so a
 * wrong guess costs nothing.
 *
 * Order matters: "electric guitar" must not be caught by the plain guitar rule
 * that follows it.
 */
const HINTS: [pattern: RegExp, subject: ChannelSubject][] = [
  [/\b(full[\s_-]?mix|mix|master|backing|instrumental|song|track)\b/, 'music'],
  [/(vocal|vox|voice|sing|lead|harmon|choir|acapella)/, 'vocals'],
  [/(drum|perc|kick|snare|hat|cymbal|kit|beat)/, 'drums'],
  [/(bass|\bdi\b|sub)/, 'bass'],
  [/(acoustic|nylon|steel|\bac[\s_-]?gtr)/, 'acoustic'],
  [/(electric|\bel[\s_-]?gtr|\belec\b|dist|overdrive|crunch)/, 'electric'],
  [/(guitar|gtr|riff)/, 'guitar'],
  [/(piano|keys|keyboard|rhodes|organ|wurli)/, 'piano'],
  [/(synth|pad|arp|lead[\s_-]?synth)/, 'synth'],
  [/(click|metronome|count[\s_-]?in|tempo)/, 'metronome']
]

/** Takes a file name or a stem name; the extension and path are ignored. */
export function guessSubject(name: string): ChannelSubject {
  const cleaned = name
    .replace(/^.*[/\\]/, '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .toLowerCase()

  for (const [pattern, subject] of HINTS) {
    if (pattern.test(cleaned)) return subject
  }
  return 'other'
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
