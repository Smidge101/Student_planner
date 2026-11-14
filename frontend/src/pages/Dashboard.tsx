import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  Lightbulb,
  Lock,
  MapPin,
  Moon,
  Sun,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { api } from '../api'
import { useMe, useUpdateProfile } from '../auth'
import { PALETTE, PALETTE_KEYS, courseColorStyle } from '../theme'
import type { Dashboard as DashboardData, DashboardTask, Me } from '../types'
import { badgeIcon } from '../badges'
import { formatDue, formatEventTime } from '../dates'
import { useToggleAssignment } from '../queries'
import { useToast } from '../toast'

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
              <p className="empty">No tasks yet. Open a class to add work.</p>
            )}
            <ul className="item-list">
              {data?.upcoming_tasks.map((task) => <DashboardTaskRow key={task.id} task={task} />)}
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

        <div className="badges-row">
          <ul className="badges" aria-label="Achievements">
            {achievements?.length ? (
              achievements.map((a) => {
                const Icon = badgeIcon(a.slug)
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
          <Link to="/achievements" className="panel-link">
            All achievements <ArrowRight aria-hidden="true" />
          </Link>
        </div>
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

function DashboardTaskRow({ task }: { task: DashboardTask }) {
  const toggle = useToggleAssignment()
  const toast = useToast()
  return (
    <li className="item item-task" style={courseColorStyle(task.course?.color)}>
      <button
        className="check-button"
        role="checkbox"
        aria-checked={false}
        aria-label={`Mark done: ${task.title}`}
        disabled={toggle.isPending}
        onClick={() =>
          toggle.mutate(
            { id: task.id, done: true },
            {
              onSuccess: ({ xp_change }) =>
                xp_change > 0 && toast({ title: `+${xp_change} XP`, text: `Finished "${task.title}"` }),
              onError: () => toast({ title: "Couldn't update that task", text: 'Please try again.' }),
            },
          )
        }
      >
        {toggle.isPending && <Check aria-hidden="true" />}
      </button>
      <div>
        <p className="item-title">
          {task.course ? <Link to={`/classes/${task.course.id}`}>{task.title}</Link> : task.title}
        </p>
        <p className={`item-meta${task.overdue ? ' overdue' : ''}`}>
          {formatDue(task.due_at)}
          {task.course && <> · {task.course.name}</>}
        </p>
      </div>
      <span className="xp-chip">+{task.xp} XP</span>
    </li>
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
