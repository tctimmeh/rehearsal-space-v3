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
