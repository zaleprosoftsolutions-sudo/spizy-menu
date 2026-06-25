import { createContext, useContext, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

const FeedbackContext = createContext(null)

const icons = {
  success: <CheckCircle2 size={20} />,
  error: <XCircle size={20} />,
  warning: <AlertTriangle size={20} />,
  info: <Info size={20} />,
}

export function AppFeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)

  const removeToast = (id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  const showToast = ({ type = 'info', title, message, duration = 3500 }) => {
    const id = crypto.randomUUID()

    setToasts((current) => [
      ...current,
      {
        id,
        type,
        title,
        message,
      },
    ])

    window.setTimeout(() => removeToast(id), duration)
  }

  const confirmAction = ({
    title = 'Are you sure?',
    message = 'Please confirm this action.',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    danger = false,
  }) => {
    return new Promise((resolve) => {
      setConfirmState({
        title,
        message,
        confirmText,
        cancelText,
        danger,
        resolve,
      })
    })
  }

  const closeConfirm = (result) => {
    if (confirmState?.resolve) {
      confirmState.resolve(result)
    }

    setConfirmState(null)
  }

  const value = useMemo(
    () => ({
      showToast,
      confirmAction,
    }),
    [],
  )

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`app-toast ${toast.type}`}>
            <div className="toast-icon">{icons[toast.type] || icons.info}</div>
            <div className="toast-content">
              {toast.title && <strong>{toast.title}</strong>}
              {toast.message && <p>{toast.message}</p>}
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => removeToast(toast.id)}
              aria-label="Close message"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {confirmState && (
        <div className="confirm-overlay">
          <div className="confirm-card">
            <div className={`confirm-icon ${confirmState.danger ? 'danger' : ''}`}>
              <AlertTriangle size={26} />
            </div>

            <h3>{confirmState.title}</h3>
            <p>{confirmState.message}</p>

            <div className="confirm-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => closeConfirm(false)}
              >
                {confirmState.cancelText}
              </button>

              <button
                type="button"
                className={`primary-button ${confirmState.danger ? 'danger' : ''}`}
                onClick={() => closeConfirm(true)}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  )
}

export function useAppFeedback() {
  const context = useContext(FeedbackContext)

  if (!context) {
    throw new Error('useAppFeedback must be used inside AppFeedbackProvider')
  }

  return context
}