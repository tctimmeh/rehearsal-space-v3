import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  title: string
  subtitle?: string
  onDismiss: () => void
  footer?: ReactNode
  children: ReactNode
}

/**
 * Rendered through a portal so a modal covers the window rather than whatever
 * positioned ancestor it happens to be declared inside.
 */
export function Modal({ title, subtitle, onDismiss, footer, children }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  return createPortal(
    <div className="scrim" onPointerDown={onDismiss}>
      <div
        className="modal"
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
