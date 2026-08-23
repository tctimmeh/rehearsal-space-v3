import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  title: string
  subtitle?: string
  onDismiss: () => void
  footer?: ReactNode
  children: ReactNode
}

export function Modal({ title, subtitle, onDismiss, footer, children }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  return (
    <div className="scrim" onPointerDown={onDismiss}>
      <div className="modal" role="dialog" aria-modal="true" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h4>{title}</h4>
          {subtitle === undefined ? null : <p>{subtitle}</p>}
        </div>
        <div className="modal__body">{children}</div>
        {footer === undefined ? null : <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  )
}
