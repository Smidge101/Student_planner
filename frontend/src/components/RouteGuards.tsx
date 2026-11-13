import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useMe } from '../auth'
import { applyTheme } from '../theme'

/** Keeps <html> in sync with the user's theme (default lavender/light when logged out). */
export function ThemeSync() {
  const { data: me } = useMe()
  useEffect(() => {
    applyTheme(me?.profile.theme_mode ?? 'light', me?.profile.accent_color ?? 'lavender')
  }, [me?.profile.theme_mode, me?.profile.accent_color])
  return null
}

export function FullPageLoader() {
  return (
    <div className="page-loader" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}

/** Only for logged-in users; others go to /login and come back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: me, isPending } = useMe()
  const location = useLocation()
  if (isPending) return <FullPageLoader />
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

/** Only for logged-out users (landing, login, signup). */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { data: me, isPending } = useMe()
  if (isPending) return <FullPageLoader />
  if (me) return <Navigate to="/dashboard" replace />
  return children
}
