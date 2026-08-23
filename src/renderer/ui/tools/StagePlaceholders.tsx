import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'

const DEMO_LINES = [
  { text: '[Verse 2]', kind: 'section' as const },
  { text: 'Counted every mile of the coast road', kind: 'lyric' as const },
  { text: "Said I'd stop when the radio gave out", kind: 'lyric' as const },
  { text: 'Nothing on the dial but a low tone', kind: 'lyric' as const },
  { text: 'Holding steady while the hills came down', kind: 'lyric' as const },
  { text: 'And I drove until the morning found me', kind: 'lyric' as const },
  { text: '', kind: 'lyric' as const },
  { text: '[Chorus]', kind: 'section' as const }
]

/** M0 shell only — the real editor lands in M9. */
export function LyricsEditorPlaceholder() {
  return (
    <div className="editor">
      <div className="editor__gutter">
        {DEMO_LINES.map((_, index) => (
          <div key={index}>{index + 11}</div>
        ))}
      </div>
      <div className="editor__text">
        {DEMO_LINES.map((line, index) => (
          <div
            key={index}
            className={line.kind === 'section' ? 'editor__section' : undefined}
            style={
              line.kind === 'section'
                ? ({ '--section-color': CHANNEL_SUBJECT_COLOR.vocals } as React.CSSProperties)
                : undefined
            }
          >
            {line.text || ' '}
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChordChartPlaceholder() {
  return <p className="tool-placeholder">Chord and scale charts arrive in M9.</p>
}

export function AlignPlaceholder() {
  return (
    <p className="tool-placeholder">
      Waveform alignment arrives in M7, once metronome channels exist.
      <br />
      It opens here, full width, with a zoom control.
    </p>
  )
}

const DEMO_RHYMES = {
  perfect: [
    ['alone', 2],
    ['grown', 1],
    ['known', 1],
    ['thrown', 1],
    ['unknown', 2],
    ['overthrown', 3]
  ],
  near: [
    ['home', 1],
    ['roam', 1],
    ['slow down', 2],
    ['hold on', 2]
  ]
} as const

export function RhymesPlaceholder() {
  return (
    <>
      <div className="well input num" style={{ fontSize: '12.5px' }}>
        tone
      </div>
      {(['perfect', 'near'] as const).map((group) => (
        <div key={group}>
          <div className="rhyme-group">{group}</div>
          <div className="rhyme-grid">
            {DEMO_RHYMES[group].map(([word, syllables]) => (
              <span key={word} className="rhyme">
                <b>{word}</b>
                <span>{syllables}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
