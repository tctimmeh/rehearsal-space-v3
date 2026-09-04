/**
 * Songs with work going on inside them, which must not be moved.
 *
 * Importing, downloading, separating and recording all work out an absolute
 * path to the song's folder and then keep it for the length of the operation
 * — through several programs, in the gaps between them, and while the peaks
 * are written at the end. A song's folder is named after its title and moves
 * when the title changes, so a name typed while a download is converting used
 * to pull the ground out from under all of that: the file was written, and
 * the pass that read it back found nothing there.
 *
 * Holding it is per song, not for the whole library: naming one song while
 * another is importing is nobody's business but that song's.
 */
const held = new Map<string, number>()

/** Holds a song still for as long as the work takes, however it ends. */
export async function holdingSong<T>(id: string, work: () => Promise<T>): Promise<T> {
  held.set(id, (held.get(id) ?? 0) + 1)
  try {
    return await work()
  } finally {
    const left = (held.get(id) ?? 1) - 1
    if (left > 0) held.set(id, left)
    else held.delete(id)
  }
}

export const songIsHeld = (id: string): boolean => held.has(id)
