import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <main className="auth-page">
      <div className="card auth-card">
        <h1>Page not found</h1>
        <p className="muted">That page doesn't exist.</p>
        <Link to="/" className="btn btn-primary">Go home</Link>
      </div>
    </main>
  )
}
