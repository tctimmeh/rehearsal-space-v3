/**
 * Keeps a scrolling view over the song from wandering off it.
 *
 * A little air is left at each end so the first and last moment are not jammed
 * against the edge — you cannot judge a transient sitting exactly on the
 * boundary. When the window is wider than the song there is nothing to scroll
 * through, so it simply centres on it.
 */
export function clampViewCentre(
  wanted: number,
  span: number,
  [start, end]: [number, number],
  margin = 1
): number {
  const air = Math.min(margin, span / 2)
  const half = span / 2
  const lowest = start - air + half
  const highest = end + air - half

  if (lowest >= highest) return (start + end) / 2
  return Math.min(highest, Math.max(lowest, wanted))
}
