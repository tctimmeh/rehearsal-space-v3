import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary'
  size?: 'default' | 'lg'
  children: ReactNode
}

export function Button({
  variant = 'default',
  size = 'default',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const classes = ['raised', 'btn']
  if (variant === 'primary') classes.push('btn--primary')
  if (size === 'lg') classes.push('btn--lg')
  if (className) classes.push(className)

  return (
    <button type="button" className={classes.join(' ')} {...rest}>
      {children}
    </button>
  )
}
