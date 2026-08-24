import { useDragValue } from './useDragValue'

interface FaderProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  /** Colours the cap's indicator line — the channel's identity colour. */
  capColor?: string
  height?: number
  /** Spoken and shown on hover; the position itself means nothing to read. */
  readout?: string
}

export function Fader({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  capColor,
  height = 54,
  readout
}: FaderProps) {
  const { handlers } = useDragValue({ value, min, max, step, onChange, travel: height })
  const fraction = max === min ? 0 : (value - min) / (max - min)

  return (
    <div
      className="fader"
      style={{ height }}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      {...(readout === undefined ? {} : { 'aria-valuetext': readout, title: `${label}: ${readout}` })}
      {...handlers}
    >
      <span className="fader__slot" />
      <span
        className="fader__cap"
        style={
          {
            top: `${(1 - fraction) * 100}%`,
            ...(capColor === undefined ? {} : { '--cap-line': capColor })
          } as React.CSSProperties
        }
      />
    </div>
  )
}
