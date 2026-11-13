// Shapes returned by the Django API.

export type ThemeMode = 'light' | 'dark'

export type PastelColor =
  | 'pink'
  | 'peach'
  | 'butter'
  | 'mint'
  | 'sky'
  | 'periwinkle'
  | 'lavender'
  | 'lilac'

export interface Me {
  id: number
  username: string
  email: string
  full_name: string
  display_name: string
  profile: {
    timezone: string
    theme_mode: ThemeMode
    accent_color: PastelColor
    email_reminders: boolean
    reminder_hours_before: number
  }
  xp: number
  level: number
  level_xp: number
  next_level_xp: number
}

export interface CourseRef {
  id: number
  name: string
  color: PastelColor
}

export interface DashboardTask {
  id: number
  title: string
  kind: 'homework' | 'quiz' | 'exam'
  due_at: string
  overdue: boolean
  xp: number
  course: CourseRef | null
}

export interface DashboardEvent {
  id: number
  title: string
  location: string
  start_at: string
  end_at: string
  course: CourseRef | null
}

export interface UnlockedAchievement {
  slug: string
  name: string
  description: string
  unlocked_at: string
}

export interface Dashboard {
  upcoming_tasks: DashboardTask[]
  upcoming_events: DashboardEvent[]
  achievements: UnlockedAchievement[]
  has_courses: boolean
}
