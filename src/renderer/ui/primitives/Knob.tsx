import { Readout } from './Readout'
import { useDragValue } from './useDragValue'

const SWEEP_DEGREES = 270

interface KnobProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  format: (value: number) => string
  /** Value the knob snaps back to on double-click. */
  defaultValue?: number
}

export function Knob({ label, value, min, max, step, onChange, format, defaultValue }: KnobProps) {
  const { handlers } = useDragValue({ value, min, max, step, onChange })
  const fraction = max === min ? 0 : (value - min) / (max - min)
  const rotation = (fraction - 0.5) * SWEEP_DEGREES

  return (
    <div className="knob-unit">
      <div
        className="knob"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        onDoubleClick={defaultValue === undefined ? undefined : () => onChange(defaultValue)}
        {...handlers}
      >
        <span className="knob__pointer" style={{ '--rot': `${rotation}deg` } as React.CSSProperties} />
      </div>
      <div className="knob-meta">
        <span className="knob-meta__label">{label}</span>
        <Readout className="knob-meta__value">{format(value)}</Readout>
      </div>
    </div>
  )
}
