import {
  BookOpen,
  CalendarDays,
  CircleQuestionMark,
  LayoutDashboard,
  LogOut,
  Settings,
  Timer,
} from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { browserTimeZone, useLogout, useMe, useUpdateProfile } from '../auth'
import AchievementWatcher from './AchievementWatcher'
import Logo from './Logo'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/classes', label: 'Classes', icon: BookOpen },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/pomodoro', label: 'Pomodoro', icon: Timer },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/help', label: 'Help', icon: CircleQuestionMark },
]

export default function AppLayout() {
  const logout = useLogout()
  const navigate = useNavigate()
  const { data: me } = useMe()
  const updateProfile = useUpdateProfile()

  // Accounts made before time zones were saved still say UTC: fix that once.
  const zone = browserTimeZone()
  const needsZone = me?.profile.timezone === 'UTC' && zone !== 'UTC'
  const { mutate: saveProfile } = updateProfile
  useEffect(() => {
    if (needsZone) saveProfile({ timezone: zone })
  }, [needsZone, zone, saveProfile])

  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>
      <AchievementWatcher />
      <aside className="sidebar">
        <NavLink to="/dashboard" className="sidebar-logo" aria-label="StudyWebPlanner dashboard">
          <Logo />
        </NavLink>
        <nav aria-label="Main">
          <ul className="nav-list">
            {NAV.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} className="nav-link">
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <button
          className="nav-link logout"
          onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/', { replace: true }) })}
          disabled={logout.isPending}
        >
          <LogOut aria-hidden="true" />
          <span>{logout.isPending ? 'Logging out…' : 'Logout'}</span>
        </button>
      </aside>
      <main id="main" className="content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
