import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import Logo from './Logo'

export default function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <main className="auth-page">
      <div className="auth-card card">
        <Link to="/" className="auth-logo" aria-label="StudyWebPlanner home">
          <Logo />
        </Link>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
      </div>
    </main>
  )
}
