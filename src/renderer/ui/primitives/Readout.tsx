import type { ReactNode } from 'react'

/**
 * Anything the user reads rather than touches sits in a well.
 */
export function Readout({
  size = 'default',
  className = '',
  children
}: {
  size?: 'default' | 'lg'
  className?: string
  children: ReactNode
}) {
  const classes = ['well', 'readout']
  if (size === 'lg') classes.push('readout--lg')
  if (className) classes.push(className)
  return <span className={classes.join(' ')}>{children}</span>
}
