import { CalendarCheck, CheckCheck, Lock, Sparkles, Star } from 'lucide-react'

import { useMe } from '../auth'
import { badgeIcon } from '../badges'
import { useAchievements, useProgressSummary } from '../queries'
import type { AchievementStatus } from '../types'

const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const whenFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function Achievements() {
  const { data: me } = useMe()
  const achievements = useAchievements()
  const summary = useProgressSummary()

  if (!me) return null
  const span = Math.max(1, me.next_level_xp - me.level_xp)
  const percent = Math.min(100, Math.round(((me.xp - me.level_xp) / span) * 100))
  const toNext = Math.max(0, me.next_level_xp - me.xp)
  const unlockedCount = achievements.data?.filter((a) => a.unlocked).length ?? 0
  const s = summary.data

  return (
    <div className="progress-page">
      <h1 className="page-title">Achievements</h1>

      <section className="card level-card" aria-labelledby="level-heading">
        <div className="level-badge" aria-hidden="true">
          <Star />
          <span>{me.level}</span>
        </div>
        <div className="level-info">
          <h2 id="level-heading">Level {me.level}</h2>
          <div
            className="xp-bar"
            role="progressbar"
            aria-label={`Progress to level ${me.level + 1}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className="xp-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="muted">
            {me.xp} XP · <strong>{toNext} XP</strong> to level {me.level + 1}
          </p>
        </div>
        <dl className="stats">
          <div><dt>Tasks done</dt><dd><CheckCheck aria-hidden="true" /> {s?.tasks_completed ?? '–'}</dd></div>
          <div><dt>Events done</dt><dd><CalendarCheck aria-hidden="true" /> {s?.events_completed ?? '–'}</dd></div>
          <div><dt>XP earned</dt><dd><Sparkles aria-hidden="true" /> {s?.xp_earned ?? '–'}</dd></div>
        </dl>
      </section>

      <section className="card panel" aria-labelledby="badges-heading">
        <div className="panel-head">
          <h2 id="badges-heading">Badges</h2>
          {achievements.data && (
            <span className="count">{unlockedCount} / {achievements.data.length}</span>
          )}
        </div>
        {achievements.isPending && <p className="muted" role="status">Loading…</p>}
        {achievements.isError && <p className="form-error" role="alert">Couldn't load achievements.</p>}
        <ul className="achievement-grid">
          {achievements.data?.map((a, i) => <AchievementTile key={a.slug ?? `secret-${i}`} achievement={a} />)}
        </ul>
      </section>

      <div className="progress-columns">
        <section className="card panel" aria-labelledby="earn-heading">
          <h2 id="earn-heading">How to earn XP</h2>
          {s && (
            <ul className="earn-list">
              <li><span>Finish homework</span><span className="xp-chip">+{s.xp_values.homework} XP</span></li>
              <li><span>Finish a quiz</span><span className="xp-chip">+{s.xp_values.quiz} XP</span></li>
              <li><span>Finish an exam</span><span className="xp-chip">+{s.xp_values.exam} XP</span></li>
              <li><span>Complete a calendar event</span><span className="xp-chip">+{s.xp_values.event} XP</span></li>
              <li><span>Pomodoro focus sessions</span><span className="muted small">Coming soon</span></li>
            </ul>
          )}
          <p className="muted small earn-note">Unchecking something takes its XP back.</p>
        </section>

        <section className="card panel" aria-labelledby="history-heading">
          <h2 id="history-heading">Recent XP</h2>
          {s && s.recent_xp.length === 0 && <p className="empty">No XP yet. Finish a task to get started!</p>}
          <ul className="history-list">
            {s?.recent_xp.map((r) => (
              <li key={r.id}>
                <span className={`history-amount${r.amount < 0 ? ' negative' : ''}`}>
                  {r.amount > 0 ? '+' : ''}{r.amount}
                </span>
                <span className="history-label">{r.label}</span>
                <time className="muted small" dateTime={r.created_at}>{whenFormat.format(new Date(r.created_at))}</time>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function AchievementTile({ achievement: a }: { achievement: AchievementStatus }) {
  const Icon = a.slug && a.unlocked ? badgeIcon(a.slug) : Lock
  const state = a.unlocked ? 'unlocked' : 'locked'
  return (
    <li className={`achievement achievement-${state}${a.hidden ? ' achievement-hidden' : ''}`}>
      <span className="achievement-icon" aria-hidden="true"><Icon /></span>
      <div className="achievement-text">
        <p className="achievement-name">
          {a.name}
          {a.hidden && <span className="hidden-tag">{a.unlocked ? 'Secret' : 'Hidden'}</span>}
        </p>
        <p className="muted small">{a.description}</p>
        {a.unlocked && a.unlocked_at && (
          <p className="achievement-date">Unlocked {shortDate.format(new Date(a.unlocked_at))}</p>
        )}
        {a.progress && (
          <div className="mini-progress">
            <div
              className="xp-bar"
              role="progressbar"
              aria-label={`${a.name} progress`}
              aria-valuemin={0}
              aria-valuemax={a.progress.target}
              aria-valuenow={a.progress.current}
            >
              <div className="xp-fill" style={{ width: `${(a.progress.current / a.progress.target) * 100}%` }} />
            </div>
            <span className="muted small">{a.progress.current} / {a.progress.target}</span>
          </div>
        )}
      </div>
      <span className="sr-only">{a.unlocked ? 'Unlocked' : 'Locked'}</span>
    </li>
  )
}
