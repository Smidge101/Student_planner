import { Navigate, Route, Routes } from 'react-router-dom'

import { GuestOnly, RequireAuth } from './components/RouteGuards'
import AppLayout from './components/AppLayout'
import Dashboard from './pages/Dashboard'
import Landing from './pages/Landing'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Placeholder from './pages/Placeholder'
import Signup from './pages/Signup'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GuestOnly><Landing /></GuestOnly>} />
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />

      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/classes" element={<Placeholder title="My Classes" phase="Class management" />} />
        <Route path="/calendar" element={<Placeholder title="Calendar" phase="Calendar and scheduling" />} />
        <Route path="/pomodoro" element={<Placeholder title="Pomodoro" phase="Pomodoro timer" />} />
        <Route path="/settings" element={<Placeholder title="Settings" phase="Settings and customization" />} />
        <Route path="/help" element={<Placeholder title="Help" phase="Help page and bug reports" />} />
      </Route>

      <Route path="/home" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
