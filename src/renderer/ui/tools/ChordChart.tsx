import { keyChart, tonicsFor, type ChordEntry, type Mode } from '@core/music/keyChart'
import { prettyChord, prettyDegree } from '@core/music/spelling'
import { TOOL_ACCENT } from '@core/ui/accents'
import { useSong } from '@renderer/state/song'

/**
 * What you can play in a key.
 *
 * The seven chords of the key are the answer to most questions, so they are
 * the top of the chart, one to a line and numbered. Under them is the same
 * seven counted from the relative key — the same chords, which is the point,
 * numbered as that key numbers them — and then what songs reach for when
 * seven is not enough.
 *
 * It sits in the drawer beside the music rather than on the stage: it is
 * something to glance at while writing, not something to work in.
 */
export function ChordChart() {
  const song = useSong((state) => state.song)
  const update = useSong((state) => state.update)

  if (song === null) return <p className="stage-empty">No song loaded.</p>

  const { tonic, mode } = song.key
  const chart = keyChart(tonic, mode)
  const relative = keyChart(chart.relative.tonic, chart.relative.mode)
  const setKey = (next: { tonic?: string; mode?: Mode }) =>
    void update({ key: { tonic: next.tonic ?? tonic, mode: next.mode ?? mode } })

  return (
    <div
      className="chart"
      style={{ '--degree-color': TOOL_ACCENT.chordDegree } as React.CSSProperties}
    >
      <div className="chart__keys">
        <label className="chart__pick">
          <span>Key</span>
          <select
            className="well input"
            value={tonic}
            onChange={(event) => setKey({ tonic: event.target.value })}
          >
            {tonicsFor(mode).map((name) => (
              <option key={name} value={name}>
                {prettyChord(name)}
              </option>
            ))}
          </select>
        </label>

        <label className="chart__pick">
          <span>Mode</span>
          <select
            className="well input"
            value={mode}
            onChange={(event) => {
              const wanted = event.target.value as Mode
              setKey({ mode: wanted, tonic: nearestTonic(tonic, wanted) })
            }}
          >
            <option value="major">Major</option>
            <option value="minor">Minor</option>
          </select>
        </label>
      </div>

      <div className="well chart__degrees">
        {chart.diatonic.map((entry) => (
          <div key={entry.degree} className="chart__degree">
            <span className="chart__numeral">{prettyDegree(entry.degree)}</span>
            <span className="chart__triad">{prettyChord(entry.triad)}</span>
            <span className="chart__seventh">{prettyChord(entry.seventh)}</span>
          </div>
        ))}
      </div>

      <div className="chart__extras">
        {/* The same seven chords, which is what makes them worth listing: what
            changes is which one is home, and so what every chord is called. */}
        <Group
          name={`In ${prettyChord(relative.tonic)} ${relative.mode}`}
          chords={relative.diatonic}
        />

        <Group
          name={`Borrowed from ${prettyChord(chart.parallel.tonic)} ${chart.parallel.mode}`}
          chords={chart.borrowed}
        />

        {chart.fromHarmonicMinor.length === 0 ? null : (
          <Group name="From harmonic minor" chords={chart.fromHarmonicMinor} />
        )}

        {chart.secondaryDominants.length === 0 ? null : (
          <div className="chart__group">
            <h4 className="chart__group-name">Leading to each degree</h4>
            <div className="chart__chips">
              {chart.secondaryDominants.map((entry) => (
                <span key={entry.chord} className="raised chart__chip">
                  {prettyChord(entry.chord)}
                  <span className="chart__chip-note">→ {prettyChord(entry.leadsTo)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Group({ name, chords }: { name: string; chords: ChordEntry[] }) {
  if (chords.length === 0) return null
  return (
    <div className="chart__group">
      <h4 className="chart__group-name">{name}</h4>
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
