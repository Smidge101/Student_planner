import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Bird,
  BookOpen,
  CalendarDays,
  CalendarHeart,
  CheckCheck,
  Clock,
  Crown,
  Flame,
  Footprints,
  Hand,
  Hourglass,
  Lightbulb,
  ListPlus,
  Lock,
  MapPin,
  Moon,
  Sun,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { api } from '../api'
import { useMe, useUpdateProfile } from '../auth'
import { PALETTE, PALETTE_KEYS, courseColorStyle } from '../theme'
import type { Dashboard as DashboardData, DashboardTask, Me } from '../types'
import { formatDue, formatEventTime } from '../dates'

const BADGE_ICONS: Record<string, LucideIcon> = {
  'most-classes': BookOpen,
  'baby-steps': Footprints,
  trailblazer: Flame,
  ceo: Crown,
  phoenix: Bird,
  'more-more-more': ListPlus,
  'ultimate-task-taker': CheckCheck,
  'study-study-study': Timer,
  'bye-bye-byee': Hand,
  'time-traveler': Hourglass,
  'busy-bee': CalendarHeart,
}

export default function Dashboard() {
  const { data: me } = useMe()
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/dashboard/'),
  })

  if (!me) return null
  const data = dashboard.data

  return (
    <div className="dashboard">
      <WelcomeCard me={me} achievements={data?.achievements} />

      {dashboard.isError ? (
        <div className="card form-error" role="alert">
          Couldn't load your dashboard.{' '}
          <button className="link-button" onClick={() => dashboard.refetch()}>Try again</button>
        </div>
      ) : (
        <div className="dashboard-grid">
          <section className="card panel" aria-labelledby="tasks-heading" aria-busy={dashboard.isPending}>
            <div className="panel-head">
              <h2 id="tasks-heading">Upcoming Tasks</h2>
              <Link to="/classes" className="panel-link">View all <ArrowRight aria-hidden="true" /></Link>
            </div>
            {data && data.upcoming_tasks.length === 0 && (
              <p className="empty">No tasks yet. Add work from a class page to see it here.</p>
            )}
            <ul className="item-list">
              {data?.upcoming_tasks.map((task) => (
                <li key={task.id} className="item" style={courseColorStyle(task.course?.color)}>
                  <span className="item-bar" aria-hidden="true" />
                  <div>
                    <p className="item-title">{task.title}</p>
                    <p className={`item-meta${task.overdue ? ' overdue' : ''}`}>
                      {formatDue(task.due_at)}
                      {task.course && <> · {task.course.name}</>}
                    </p>
                  </div>
                  <span className="xp-chip">+{task.xp} XP</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card panel" aria-labelledby="events-heading" aria-busy={dashboard.isPending}>
            <div className="panel-head">
              <h2 id="events-heading">Upcoming Events</h2>
              <Link to="/calendar" className="panel-link">View calendar <ArrowRight aria-hidden="true" /></Link>
            </div>
            {data && data.upcoming_events.length === 0 && (
              <p className="empty">Nothing in the next 7 days.</p>
            )}
            <ul className="item-list">
              {data?.upcoming_events.map((event) => (
                <li key={event.id} className="item" style={courseColorStyle(event.course?.color)}>
                  <span className="item-icon" aria-hidden="true"><CalendarDays /></span>
                  <div>
                    <p className="item-title">{event.title}</p>
                    <p className="item-meta">
                      <Clock aria-hidden="true" /> {formatEventTime(event.start_at)}
                      {event.location && <> · <MapPin aria-hidden="true" /> {event.location}</>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <SuggestedCard data={data} />
        </div>
      )}
    </div>
  )
}

function WelcomeCard({ me, achievements }: { me: Me; achievements?: DashboardData['achievements'] }) {
  const update = useUpdateProfile()
  const span = Math.max(1, me.next_level_xp - me.level_xp)
  const percent = Math.min(100, Math.round(((me.xp - me.level_xp) / span) * 100))
  const isDark = me.profile.theme_mode === 'dark'

  return (
    <section className="card welcome" aria-labelledby="welcome-heading">
      <div className="welcome-main">
        <h1 id="welcome-heading">Welcome back, {me.display_name}!</h1>
        <div className="level-row">
          <span className="level-label">Level {me.level}</span>
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
          <span className="xp-label">{me.xp} / {me.next_level_xp} XP</span>
        </div>

        <ul className="badges" aria-label="Achievements">
          {achievements?.length ? (
            achievements.map((a) => {
              const Icon = BADGE_ICONS[a.slug] ?? Crown
              return (
                <li key={a.slug} className="badge" title={`${a.name}: ${a.description}`}>
                  <Icon aria-hidden="true" />
                  <span className="sr-only">{a.name}</span>
                </li>
              )
            })
          ) : (
            <li className="badge-empty">
              <span className="badge locked" aria-hidden="true"><Lock /></span>
              <span className="muted">Complete tasks to earn your first badge.</span>
            </li>
          )}
        </ul>
      </div>

      <div className="theme-picker">
        <div className="swatches" role="group" aria-label="Dashboard color">
          {PALETTE_KEYS.map((key) => (
            <button
              key={key}
              className="swatch"
              style={{ background: PALETTE[key].hex }}
              aria-label={PALETTE[key].label}
              aria-pressed={me.profile.accent_color === key}
              onClick={() => update.mutate({ accent_color: key })}
            />
          ))}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => update.mutate({ theme_mode: isDark ? 'light' : 'dark' })}
        >
          {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
        {update.isError && <small className="field-error" role="alert">Couldn't save that. Try again.</small>}
      </div>
    </section>
  )
}

/** One suggestion for what to do next to earn XP. */
function suggestion(data: DashboardData): { text: string; action: string; to: string } {
  if (!data.has_courses) {
    return { text: 'Start by adding your first class.', action: 'Add a class', to: '/classes' }
  }
  const next: DashboardTask | undefined = data.upcoming_tasks[0]
  if (next?.overdue) {
    return { text: `Catch up on "${next.title}" for +${next.xp} XP.`, action: 'Go to classes', to: '/classes' }
  }
  if (next) {
    return { text: `Get ahead on "${next.title}" for +${next.xp} XP.`, action: 'Go to classes', to: '/classes' }
  }
  return { text: 'All caught up! A focus session earns XP too.', action: 'Start a Pomodoro', to: '/pomodoro' }
}

function SuggestedCard({ data }: { data?: DashboardData }) {
  const tip = data ? suggestion(data) : null
  return (
    <section className="card panel suggested" aria-labelledby="suggested-heading">
      <h2 id="suggested-heading"><Lightbulb aria-hidden="true" /> Suggested</h2>
      {tip && (
        <>
          <p>{tip.text}</p>
          <Link to={tip.to} className="btn btn-primary btn-sm">{tip.action}</Link>
        </>
      )}
    </section>
  )
}
