import type { HTMLAttributes, ReactNode } from 'react'

interface ReadoutProps extends HTMLAttributes<HTMLSpanElement> {
  size?: 'default' | 'lg'
  children: ReactNode
}

/**
 * Anything the user reads rather than touches sits in a well.
 */
export function Readout({ size = 'default', className = '', children, ...rest }: ReadoutProps) {
  const classes = ['well', 'readout']
  if (size === 'lg') classes.push('readout--lg')
  if (className) classes.push(className)
  return (
    <span className={classes.join(' ')} {...rest}>
      {children}
    </span>
  )
}
