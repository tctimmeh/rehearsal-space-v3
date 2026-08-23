import type { ReactNode } from 'react'

interface IconProps {
  size?: number
  strokeWidth?: number
  children: ReactNode
}

export function Icon({ size = 18, strokeWidth = 1.7, children }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}
