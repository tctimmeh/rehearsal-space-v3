import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { useHoldRepeat } from './useHoldRepeat'

interface RepeatButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  onPress: () => void
  children: ReactNode
}

/** A button that keeps going while it is held. */
export function RepeatButton({ onPress, children, ...rest }: RepeatButtonProps) {
  const held = useHoldRepeat(onPress)
  return (
    <button type="button" {...rest} {...held}>
      {children}
    </button>
  )
}
