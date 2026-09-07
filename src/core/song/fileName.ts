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
  return fileStemFor(sourcePath.replace(/^.*[/\\]/, '').replace(/\.[a-z0-9]{1,5}$/i, ''))
}

/**
 * The same rules for something that is a name rather than a path.
 *
 * Nothing is stripped from it: a channel called "Mix v1.2" is not a file
 * called "Mix v1" with an extension, and taking the end off it would be
 * taking off part of the name.
 */
export function fileStemFor(name: string): string {
  const stem = name
    .replace(UNSAFE, ' ')
    .replace(/\s+/g, ' ')
    /* A leading dot would hide the file; a trailing one upsets Windows. */
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, MAX_STEM_LENGTH)
    .trim()

  return stem === '' ? 'audio' : stem
}
