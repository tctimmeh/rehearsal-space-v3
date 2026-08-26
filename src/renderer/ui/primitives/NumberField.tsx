import { RepeatButton } from './RepeatButton'

interface NumberFieldProps {
  /** Names the field and its two arrows, which need saying apart. */
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
}

/**
 * A number with arrows to step it.
 *
 * The browser draws its own pair, in its own light grey, and they cannot be
 * given a colour — the only thing CSS can do with them is take them away. So
 * they are taken away and replaced with a pair made of the same materials as
 * everything else here, which can also be held down to run.
 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  className = ''
}: NumberFieldProps) {
  const held = (next: number) =>
    Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, next))

  const nudge = (delta: number) => onChange(held(value + delta))

  return (
    <span className={`number-field ${className}`}>
      <input
        className="well input num number-field__input"
        type="number"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          /* An empty field is on the way to another number, not a zero. */
          if (event.target.value === '') return
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(held(next))
        }}
      />
      <span className="number-field__steps">
        <RepeatButton
          className="raised number-field__step"
          aria-label={`${label} up`}
          disabled={max !== undefined && value >= max}
          onPress={() => nudge(step)}
        >
          ▲
        </RepeatButton>
        <RepeatButton
          className="raised number-field__step"
          aria-label={`${label} down`}
          disabled={min !== undefined && value <= min}
          onPress={() => nudge(-step)}
        >
          ▼
        </RepeatButton>
      </span>
    </span>
  )
}
