// Data hooks for classes and tasks. Every change refreshes the things it can
// affect: lists, the dashboard, XP/level, and the "new achievement" feed.

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { api } from './api'
import type {
  AchievementStatus,
  Assignment,
  CalendarEvent,
  Course,
  Meeting,
  PastelColor,
  ProgressSummary,
  TaskKind,
} from './types'

export function refreshAfterChange(queryClient: QueryClient, deletedCourseId?: number) {
  for (const key of ['courses', 'assignments', 'events', 'dashboard', 'me', 'achievements-unseen', 'achievements', 'progress']) {
    queryClient.invalidateQueries({
      queryKey: [key],
      // Don't refetch a class that was just deleted (it would 404).
      predicate: (q) => deletedCourseId === undefined || q.queryKey[1] !== deletedCourseId,
    })
  }
}

/** Colors already used by other classes, mapped to the class using each. */
export function takenColorsExcept(courses: Course[] | undefined, except?: Course) {
  return new Map<PastelColor, string>(
    (courses ?? []).filter((c) => c.id !== except?.id).map((c) => [c.color, c.name]),
  )
}

export function useCourses() {
  return useQuery({ queryKey: ['courses'], queryFn: () => api<Course[]>('/courses/') })
}

export function useCourse(id: number) {
  return useQuery({
    queryKey: ['courses', id],
    queryFn: () => api<Course>(`/courses/${id}/`),
    enabled: Number.isInteger(id),
  })
}

export interface CourseInput {
  name: string
  color: PastelColor
  meetings: Meeting[]
}

export function useSaveCourse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: CourseInput }) =>
      id ? api<Course>(`/courses/${id}/`, 'PATCH', data) : api<Course>('/courses/', 'POST', data),
    onSuccess: () => refreshAfterChange(queryClient),
  })
}

export function useDeleteCourse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/courses/${id}/`, 'DELETE'),
    onSuccess: (_data, id) => refreshAfterChange(queryClient, id),
  })
}

export function useAssignments(courseId: number) {
  return useQuery({
    queryKey: ['assignments', { course: courseId }],
    queryFn: () => api<Assignment[]>(`/assignments/?course=${courseId}`),
  })
}

export interface AssignmentInput {
  title: string
  description: string
  kind: TaskKind
  due_at: string
  course: number | null
}

export function useSaveAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: AssignmentInput }) =>
      id
        ? api<Assignment>(`/assignments/${id}/`, 'PATCH', data)
        : api<Assignment>('/assignments/', 'POST', data),
    onSuccess: () => refreshAfterChange(queryClient),
  })
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/assignments/${id}/`, 'DELETE'),
    onSuccess: () => refreshAfterChange(queryClient),
  })
}

export function useToggleAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      api<{ assignment: Assignment; xp_change: number }>(
        `/assignments/${id}/${done ? 'complete' : 'uncomplete'}/`,
        'POST',
      ),
    onSuccess: () => refreshAfterChange(queryClient),
  })
}

// ---------- Calendar ----------

/** Events overlapping [start, end) and tasks due in it. */
export function useCalendarRange(start: Date, end: Date) {
  const range = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`
  const due = `due_after=${encodeURIComponent(start.toISOString())}&due_before=${encodeURIComponent(end.toISOString())}`
  const events = useQuery({
    queryKey: ['events', start.toISOString(), end.toISOString()],
    queryFn: () => api<CalendarEvent[]>(`/events/?${range}`),
  })
  const tasks = useQuery({
    queryKey: ['assignments', { start: start.toISOString(), end: end.toISOString() }],
    queryFn: () => api<Assignment[]>(`/assignments/?${due}`),
  })
  return { events, tasks }
}

export interface EventInput {
  title: string
  description: string
  location: string
  start_at: string
  end_at: string
  course: number | null
}

export function useSaveEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: EventInput }) =>
      id ? api<CalendarEvent>(`/events/${id}/`, 'PATCH', data) : api<CalendarEvent>('/events/', 'POST', data),
    onSuccess: () => refreshAfterChange(queryClient),
  })
}

export function useDeleteEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/events/${id}/`, 'DELETE'),
    onSuccess: () => refreshAfterChange(queryClient),
  })
}

export function useToggleEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      api<{ event: CalendarEvent; xp_change: number }>(`/events/${id}/${done ? 'complete' : 'uncomplete'}/`, 'POST'),
    onSuccess: () => refreshAfterChange(queryClient),
  })
}

// ---------- Achievements & progress ----------

export function useAchievements() {
  return useQuery({ queryKey: ['achievements'], queryFn: () => api<AchievementStatus[]>('/achievements/') })
}

export function useProgressSummary() {
  return useQuery({ queryKey: ['progress'], queryFn: () => api<ProgressSummary>('/progress/') })
}
