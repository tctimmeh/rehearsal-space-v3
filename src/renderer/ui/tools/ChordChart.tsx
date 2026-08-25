import { keyChart, tonicsFor, type ChordEntry, type Mode } from '@core/music/keyChart'
import { prettyChord, prettyDegree } from '@core/music/spelling'
import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import { useSong } from '@renderer/state/song'

/**
 * What you can play in a key.
 *
 * The seven chords of the key are the answer to most questions, so they are
 * the whole top of the chart, big enough to read from a music stand. What sits
 * under them is what songs reach for when seven is not enough: the same
 * degrees borrowed from the parallel key, the chord that leads to each degree,
 * and — in a minor key — the chords that make a dominant possible at all.
 */
export function ChordChart() {
  const song = useSong((state) => state.song)
  const update = useSong((state) => state.update)

  if (song === null) return <p className="stage-empty">No song loaded.</p>

  const { tonic, mode } = song.key
  const chart = keyChart(tonic, mode)
  const setKey = (next: { tonic?: string; mode?: Mode }) =>
    void update({ key: { tonic: next.tonic ?? tonic, mode: next.mode ?? mode } })

  return (
    <div className="chart" style={{ '--degree-color': CHANNEL_SUBJECT_COLOR.piano } as React.CSSProperties}>
      <div className="chart__keys">
        <div className="chart__tonics" role="group" aria-label="Key">
          {tonicsFor(mode).map((name) => (
            <button
              key={name}
              type="button"
              className="raised chart__tonic"
              data-engaged={name === tonic}
              onClick={() => setKey({ tonic: name })}
            >
              {prettyChord(name)}
            </button>
          ))}
        </div>

        <div className="chart__modes" role="group" aria-label="Mode">
          {(['major', 'minor'] as const).map((name) => (
            <button
              key={name}
              type="button"
              className="raised chart__mode"
              data-engaged={name === mode}
              onClick={() => setKey({ mode: name, tonic: nearestTonic(tonic, name) })}
            >
              {name === 'major' ? 'Major' : 'Minor'}
            </button>
          ))}
        </div>

        <span className="chart__signature">
          {chart.signature} · relative {prettyChord(chart.relative.tonic)} {chart.relative.mode}
        </span>
      </div>

      <div className="chart__degrees">
        {chart.diatonic.map((entry) => (
          <div key={entry.degree} className="well chart__degree">
            <span className="chart__numeral">{prettyDegree(entry.degree)}</span>
            <span className="chart__triad">{prettyChord(entry.triad)}</span>
            <span className="chart__seventh">{prettyChord(entry.seventh)}</span>
          </div>
        ))}
      </div>

      <div className="chart__extras">
        <Group
          name={`Borrowed from ${prettyChord(chart.parallel.tonic)} ${chart.parallel.mode}`}
          note="the same degrees, from the key that shares this tonic"
          chords={chart.borrowed}
        />

        {chart.fromHarmonicMinor.length === 0 ? null : (
          <Group
            name="From harmonic minor"
            note="natural minor has no dominant, which is why few songs stay in it"
            chords={chart.fromHarmonicMinor}
          />
        )}

        <div className="chart__group">
          <h4 className="chart__group-name">Leading to each degree</h4>
          <p className="chart__group-note">the dominant of each chord, borrowed for a bar</p>
          <div className="chart__chips">
            {chart.secondaryDominants.map((entry) => (
              <span key={entry.chord} className="raised chart__chip">
                {prettyChord(entry.chord)}
                <span className="chart__chip-note">→ {prettyChord(entry.leadsTo)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Group({ name, note, chords }: { name: string; note: string; chords: ChordEntry[] }) {
  if (chords.length === 0) return null
  return (
    <div className="chart__group">
      <h4 className="chart__group-name">{name}</h4>
      <p className="chart__group-note">{note}</p>
      <div className="chart__chips">
        {chords.map((entry) => (
          <span key={entry.triad} className="raised chart__chip">
            {prettyChord(entry.triad)}
            <span className="chart__chip-note">{prettyDegree(entry.degree)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Switching mode keeps the pitch but may change how it is spelled: E flat is
 * how a major key on that pitch is written, D sharp is how a minor one is.
 */
function nearestTonic(tonic: string, mode: Mode): string {
  const offered = tonicsFor(mode)
  if (offered.includes(tonic)) return tonic
  const flats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
  const sharps = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const chroma = Math.max(flats.indexOf(tonic), sharps.indexOf(tonic))
  return offered[chroma] ?? 'C'
}
