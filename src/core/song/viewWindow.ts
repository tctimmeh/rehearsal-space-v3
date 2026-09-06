/**
 * Keeps a scrolling view over the song from wandering off it.
 *
 * Air is left at each end so the first and last moment are not jammed against
 * the edge — you cannot judge a transient sitting exactly on the boundary, and
 * a count-in that begins before 00:00 needs somewhere to be looked at from.
 * How much is the caller's to say, up to half a window. When the window is
 * wider than the song there is nothing to scroll through, so it simply centres
 * on it.
 */
export function clampViewCentre(
  wanted: number,
  span: number,
  [start, end]: [number, number],
  margin = 1
): number {
  /* A window wider than the song has air to spare at both ends already, and
     letting it scroll would only slide the song about inside itself. */
  if (span >= end - start) return (start + end) / 2

  const half = span / 2
  const air = Math.min(margin, half)
  const lowest = start - air + half
  const highest = end + air - half

  if (lowest >= highest) return (start + end) / 2
  return Math.min(highest, Math.max(lowest, wanted))
}

/**
 * Where the view should sit so a moment stays on screen.
 *
 * The answer is nearly always "exactly where it is". A view that recentres on
 * whatever is being dragged moves the music under the pointer, so the thing
 * being aimed at runs away from the aim.
 *
 * It gives ground only once the moment has actually left the window, and then
 * only enough to bring it back just inside. Treating the margin as a zone that
 * *triggers* the scroll looks the same until you try it: the view then moves
 * whenever the moment is merely near an edge — including while it is being
 * brought back towards the middle, which is the one time it must not.
 */
export function centreToShow(time: number, centre: number, span: number, edge = 0.02): number {
  const room = span * edge
  const from = centre - span / 2
  const to = centre + span / 2

  if (time < from) return time + span / 2 - room
  if (time > to) return time - span / 2 + room
  return centre
}
