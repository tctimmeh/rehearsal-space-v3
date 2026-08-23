import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import { Readout } from '../primitives'

/** M0 shell only — nothing is listening until M9. */
export function TunerGadget() {
  const note = 'A'
  const cents = 4

  return (
    <>
      <Readout size="lg">{note}</Readout>
      <div>
        <div className="well cents">
          <span className="cents__center" />
          <span
            className="cents__needle"
            style={{
              left: `${50 + cents}%`,
              background: Math.abs(cents) <= 5 ? CHANNEL_SUBJECT_COLOR.drums : CHANNEL_SUBJECT_COLOR.vocals
            }}
          />
        </div>
        <div className="cents__scale">
          <span>−50</span>
          <span>
            {cents > 0 ? '+' : ''}
            {cents} cents
          </span>
          <span>+50</span>
        </div>
      </div>
    </>
  )
}
