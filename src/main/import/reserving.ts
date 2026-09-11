/**
 * Ids promised to jobs that have not written their file yet.
 *
 * A channel id is made unique against the channels already in the song and the
 * files already in its audio folder, and neither of those knows about a
 * conversion that has been planned but has not yet produced a byte. Two adds
 * started moments apart would mint the same id, and the second would write its
 * waveform over the first's.
 *
 * Keyed by the song's directory, which is what the jobs hold and which nothing
 * can rename while they are running.
 */
const promised = new Map<string, Set<string>>()

export const reservedIn = (directory: string): string[] => [...(promised.get(directory) ?? [])]

/** Keeps the ids to itself for as long as the work takes, however it ends. */
export async function reserving<T>(
  directory: string,
  ids: string[],
  work: () => Promise<T>
): Promise<T> {
  const here = promised.get(directory) ?? new Set<string>()
  promised.set(directory, here)
  for (const id of ids) here.add(id)
  try {
    return await work()
  } finally {
    for (const id of ids) here.delete(id)
    if (here.size === 0) promised.delete(directory)
  }
}
