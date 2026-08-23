export interface JobToast {
  id: string
  title: string
  detail: string
  /** Null while a job reports no measurable progress. */
  progress: number | null
  state: 'running' | 'done' | 'failed'
  color: string
}

/**
 * Jobs report here while you carry on working — a split already running keeps
 * reporting while you set up the next.
 */
export function ToastStack({ toasts }: { toasts: JobToast[] }) {
  if (toasts.length === 0) return null

  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          <div className="toast__top">
            <span className="toast__lamp" style={{ background: toast.color }} />
            <span className="toast__name">{toast.title}</span>
            {toast.progress === null ? null : (
              <span className="toast__pct">{Math.round(toast.progress * 100)}%</span>
            )}
          </div>
          <div className="toast__sub">{toast.detail}</div>
          {toast.progress === null ? null : (
            <div className="toast__bar">
              <i style={{ width: `${toast.progress * 100}%`, background: toast.color }} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
