// Data hooks for classes and tasks. Every change refreshes the things it can
// affect: lists, the dashboard, XP/level, and the "new achievement" feed.

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { api } from './api'
import type { Assignment, Course, Meeting, PastelColor, TaskKind } from './types'

export function refreshAfterChange(queryClient: QueryClient, deletedCourseId?: number) {
  for (const key of ['courses', 'assignments', 'dashboard', 'me', 'achievements-unseen']) {
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
