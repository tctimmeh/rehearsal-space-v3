import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  engaged?: boolean
  variant?: 'default' | 'go'
  children: ReactNode
}

export function IconButton({
  label,
  engaged = false,
  variant = 'default',
  className = '',
  children,
  ...rest
}: IconButtonProps) {
  const classes = ['raised', 'icon-btn']
  if (variant === 'go') classes.push('icon-btn--go')
  if (className) classes.push(className)

  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-engaged={engaged}
      title={label}
      aria-label={label}
      {...rest}
    >
      {children}
    </button>
  )
}
