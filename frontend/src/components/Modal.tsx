import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * A native <dialog>: keeps focus inside, closes on Esc, and puts the rest of
 * the page behind a backdrop. Rendered only while `open` is true.
 */
export default function Modal({
  title,
  onClose,
  children,
  size = 'md',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  size?: 'sm' | 'md'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      // showModal() focuses the first button (the X); move focus to the
      // field marked data-autofocus instead, e.g. the class name.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className={`modal modal-${size}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose() // click on the backdrop
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <X aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>
  )
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string
  message: ReactNode
  confirmLabel: string
  pending?: boolean
  error?: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal title={title} onClose={onClose} size="sm">
      <div className="modal-body">{message}</div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose} data-autofocus>Cancel</button>
        <button className="btn btn-danger" onClick={onConfirm} disabled={pending}>
          {pending ? 'Deleting…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
