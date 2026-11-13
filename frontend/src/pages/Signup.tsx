import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ApiError } from '../api'
import { browserTimeZone, useSignup, type SignupData } from '../auth'
import AuthCard from '../components/AuthCard'

const EMPTY: SignupData = {
  full_name: '',
  email: '',
  username: '',
  password: '',
  password_confirm: '',
  email_reminders: true,
}

export default function Signup() {
  const signup = useSignup()
  const navigate = useNavigate()
  const [form, setForm] = useState<SignupData>(EMPTY)

  const error = signup.error instanceof ApiError ? signup.error : null
  const mismatch = form.password_confirm !== '' && form.password !== form.password_confirm

  function set<K extends keyof SignupData>(key: K, value: SignupData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (mismatch) return
    signup.mutate({ ...form, timezone: browserTimeZone() }, { onSuccess: () => navigate('/dashboard', { replace: true }) })
  }

  const fields: { key: keyof SignupData; label: string; type?: string; autoComplete: string; hint?: string }[] = [
    { key: 'full_name', label: 'Full name', autoComplete: 'name' },
    { key: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
    { key: 'username', label: 'Username', autoComplete: 'username', hint: '3–30 letters, numbers, dots, dashes or underscores.' },
    { key: 'password', label: 'Create password', type: 'password', autoComplete: 'new-password', hint: 'At least 8 characters, not too common.' },
    { key: 'password_confirm', label: 'Retype password', type: 'password', autoComplete: 'new-password' },
  ]

  return (
    <AuthCard title="Create your planner" subtitle="It takes less than a minute.">
      <form onSubmit={onSubmit} className="form" noValidate>
        {error?.detail && <p className="form-error" role="alert">{error.detail}</p>}
        {fields.map(({ key, label, type, autoComplete, hint }) => {
          const message =
            key === 'password_confirm' && mismatch ? 'Passwords do not match.' : error?.field(key)
          const id = `signup-${key}`
          return (
            <label className="field" key={key} htmlFor={id}>
              <span>{label}</span>
              <input
                id={id}
                type={type ?? 'text'}
                value={form[key] as string}
                onChange={(e) => set(key, e.target.value)}
                autoComplete={autoComplete}
                aria-invalid={message ? true : undefined}
                aria-describedby={message ? `${id}-error` : hint ? `${id}-hint` : undefined}
                required
              />
              {message ? (
                <small id={`${id}-error`} className="field-error">{message}</small>
              ) : (
                hint && <small id={`${id}-hint`} className="field-hint">{hint}</small>
              )}
            </label>
          )
        })}
        <label className="check">
          <input
            type="checkbox"
            checked={form.email_reminders}
            onChange={(e) => set('email_reminders', e.target.checked)}
          />
          <span>Email me reminders before my tasks are due</span>
        </label>
        <button
          className="btn btn-primary btn-block"
          disabled={signup.isPending || mismatch || Object.values(form).some((v) => v === '')}
        >
          {signup.isPending ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <p className="auth-switch">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </AuthCard>
  )
}
