import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { escapeAnswered } from './escape'

interface ModalProps {
  title: string
  subtitle?: string
  /**
   * How much room it takes. A question needs little, a form needs more, and
   * lines of output want as much of the window as they can have: a log broken
   * up over three lines each is not a log anybody can read.
   */
  size?: 'default' | 'wide' | 'log'
  onDismiss: () => void
  footer?: ReactNode
  children: ReactNode
}

/**
 * Rendered through a portal so a modal covers the window rather than whatever
 * positioned ancestor it happens to be declared inside.
 */
export function Modal({
  title,
  subtitle,
  size = 'default',
  onDismiss,
  footer,
  children
}: ModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      escapeAnswered(event)
      onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  return createPortal(
    <div className="scrim" onPointerDown={onDismiss}>
      <div
        className={size === 'default' ? 'modal' : `modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="modal__head">
          <h4>{title}</h4>
          {subtitle === undefined ? null : <p>{subtitle}</p>}
        </div>
        <div className="modal__body">{children}</div>
        {footer === undefined ? null : <div className="modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
