import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from '../api'
import { useLogin } from '../auth'
import AuthCard from '../components/AuthCard'

export default function Login() {
  const login = useLogin()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'
  const error = login.error instanceof ApiError ? login.error : null

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    login.mutate({ username, password }, { onSuccess: () => navigate(from, { replace: true }) })
  }

  return (
    <AuthCard title="Welcome back!" subtitle="Log in to see your classes and tasks.">
      <form onSubmit={onSubmit} className="form" noValidate>
        {error?.detail && <p className="form-error" role="alert">{error.detail}</p>}
        <label className="field">
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button className="btn btn-primary btn-block" disabled={login.isPending || !username || !password}>
          {login.isPending ? 'Logging in…' : 'Log in'}
        </button>
        <p className="form-note">
          Forgot your password? Password reset by email is coming soon.
        </p>
      </form>
      <p className="auth-switch">
        New here? <Link to="/signup">Create an account</Link>
      </p>
    </AuthCard>
  )
}
