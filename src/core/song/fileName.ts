/** Long enough for any real name, short of what a filesystem will refuse. */
const MAX_STEM_LENGTH = 80

/** Characters no filesystem should be asked to hold, control codes included. */
const UNSAFE = /[\u0000-\u001f<>:"/\\|?*]/g

/**
 * Turns a source path into the name its converted copy will carry, so the
 * song's audio folder reads like the files that went into it rather than a
 * list of hashes.
 *
 * Everything that could confuse a filesystem goes; the rest — spaces, capitals,
 * the user's own separators — is theirs and is kept.
 */
export function audioFileStem(sourcePath: string): string {
  const stem = sourcePath
    .replace(/^.*[/\\]/, '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(UNSAFE, ' ')
    .replace(/\s+/g, ' ')
    /* A leading dot would hide the file; a trailing one upsets Windows. */
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, MAX_STEM_LENGTH)
    .trim()

  return stem === '' ? 'audio' : stem
}
