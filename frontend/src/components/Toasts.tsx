import { X } from 'lucide-react'
import { useCallback, useRef, useState, type ReactNode } from 'react'

import { ToastContext, type Toast } from '../toast'

const TOAST_MS = { info: 3500, achievement: 6000 }

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++
      setToasts((list) => [...list, { ...toast, id }])
      window.setTimeout(() => dismiss(id), TOAST_MS[toast.variant ?? 'info'])
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(({ id, title, text, icon: Icon, variant = 'info', kicker }) => (
          <div key={id} className={`toast toast-${variant}`}>
            {Icon && (
              <span className="toast-icon" aria-hidden="true">
                <Icon />
              </span>
            )}
            <div className="toast-body">
              {(kicker || variant === 'achievement') && (
                <p className="toast-kicker">{kicker ?? 'Achievement unlocked'}</p>
              )}
              <p className="toast-title">{title}</p>
              {text && <p className="toast-text">{text}</p>}
            </div>
            <button className="icon-button" onClick={() => dismiss(id)} aria-label="Dismiss">
              <X aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
