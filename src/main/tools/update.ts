import type { ToolSource } from '../../shared/tools'

/**
 * Keeping yt-dlp current.
 *
 * It is the one tool here that goes stale by itself: it keeps up with sites
 * that change under it, and a copy a few weeks old starts failing on
 * downloads that worked yesterday. It can update itself, so it is asked to at
 * every start.
 */

/** Long enough to fetch a new one, short enough not to sit there forever. */
export const UPDATE_TIMEOUT_MS = 120000

export interface Found {
  path: string
  source: ToolSource
}

/**
 * Updates the app's own yt-dlp in place, and only ever its own.
 *
 * `-U` rewrites the program where it stands. That is exactly right for the
 * copy the app fetched into its own directory, and exactly wrong for one that
 * belongs to the machine or to whoever pointed the app at it: a package
 * manager's file is that package manager's business, and someone who chose a
 * particular build chose it deliberately.
 *
 * Says whether it ran one, rather than whether that found anything new — being
 * already current is a perfectly good outcome.
 */
export async function updateInPlace(
  found: Found | null,
  run: (path: string, args: string[]) => Promise<void>
): Promise<boolean> {
  if (found === null || found.source !== 'private') return false
  await run(found.path, ['-U'])
  return true
}
