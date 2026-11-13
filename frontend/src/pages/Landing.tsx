import { CalendarDays, CheckCheck, BookOpen, Timer, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'

import Logo from '../components/Logo'

const FEATURES = [
  { icon: BookOpen, title: 'Class management', text: 'Add your classes and their weekly times.' },
  { icon: CheckCheck, title: 'Assignment tracker', text: 'Homework, quizzes and exams with due dates.' },
  { icon: CalendarDays, title: 'Calendar', text: 'Classes and work land on your calendar automatically.' },
  { icon: Timer, title: 'Pomodoro timer', text: 'Focus in sets of work and break time.' },
  { icon: Trophy, title: 'XP & achievements', text: 'Level up and unlock badges as you get work done.' },
]

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo />
        <nav aria-label="Account">
          <Link to="/login" className="btn btn-ghost">Log in</Link>
          <Link to="/signup" className="btn btn-primary">Sign up</Link>
        </nav>
      </header>

      <main>
        <section className="hero">
          <h1>Plan. Study. Achieve.</h1>
          <p>
            Your all-in-one student planner to stay organized, track your progress,
            and level up as you get work done.
          </p>
          <div className="hero-actions">
            <Link to="/signup" className="btn btn-primary btn-lg">Get started</Link>
            <Link to="/login" className="btn btn-ghost btn-lg">I have an account</Link>
          </div>
        </section>

        <section className="features" aria-labelledby="features-heading">
          <h2 id="features-heading">What's inside</h2>
          <ul className="feature-grid">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="card feature">
                <Icon aria-hidden="true" />
                <h3>{title}</h3>
                <p className="muted">{text}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="landing-footer muted">© {new Date().getFullYear()} StudyWebPlanner</footer>
    </div>
  )
}
