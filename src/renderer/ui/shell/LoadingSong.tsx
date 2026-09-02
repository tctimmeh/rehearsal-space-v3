import { useSong } from '@renderer/state/song'

/**
 * What the app is doing while a song is being read in.
 *
 * Over the stage and in the middle of it, because that is where the eye
 * already is: the song has been asked for and nothing has appeared yet, and a
 * line of small print at the end of the scrub bar is not an answer anybody
 * finds. It says how far along it is where the channels can be counted, and
 * simply that it is working where they cannot — the count arrives only once
 * the song has been read off disk.
 */
export function LoadingSong() {
  const loading = useSong((state) => state.loading)
  if (loading === null) return null

  const counted = loading.total > 0
  /* Nothing has finished yet, so there is no length to draw — but something is
     going on, and a bar sitting flat and empty says the opposite. It sweeps
     until the first channel lands and measures from then on. */
  const started = loading.decoded > 0
  const done = counted ? loading.decoded / loading.total : 0

  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="loading__what">Loading the song</span>
      <div className="loading__track">
        <span
          className="loading__fill"
          data-measured={started}
          style={started ? { width: `${Math.round(done * 100)}%` } : undefined}
        />
      </div>
      <span className="loading__count">
        {counted ? `${loading.decoded} of ${loading.total} channels` : 'Reading it in…'}
      </span>
    </div>
  )
}
