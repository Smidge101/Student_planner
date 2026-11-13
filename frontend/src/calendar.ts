// Turns classes, tasks and events into one list of calendar items.

import { addDays, atTime, meetingWeekday, sameDay } from './dates'
import type { Assignment, CalendarEvent, Course, PastelColor } from './types'

export type ItemKind = 'class' | 'task' | 'event'

export interface CalendarItem {
  key: string
  kind: ItemKind
  title: string
  start: Date
  end?: Date
  color?: PastelColor
  done: boolean
  /** Where clicking goes: a class page, or the event itself. */
  courseId?: number
  event?: CalendarEvent
  location?: string
}

/**
 * Weekly class meetings repeat on every matching day in [start, end).
 * Tasks show at their due time; events at their start.
 */
export function buildItems(
  start: Date,
  end: Date,
  courses: Course[],
  tasks: Assignment[],
  events: CalendarEvent[],
): CalendarItem[] {
  const items: CalendarItem[] = []
  const courseById = new Map(courses.map((c) => [c.id, c]))

  for (let day = start; day < end; day = addDays(day, 1)) {
    const weekday = meetingWeekday(day)
    for (const course of courses) {
      for (const m of course.meetings) {
        if (m.weekday !== weekday) continue
        items.push({
          key: `class-${course.id}-${day.toDateString()}-${m.start_time}`,
          kind: 'class',
          title: course.name,
          start: atTime(day, m.start_time),
          end: atTime(day, m.end_time),
          color: course.color,
          done: false,
          courseId: course.id,
          location: m.location,
        })
      }
    }
  }

  for (const t of tasks) {
    const course = t.course ? courseById.get(t.course) : undefined
    items.push({
      key: `task-${t.id}`,
      kind: 'task',
      title: t.title,
      start: new Date(t.due_at),
      color: course?.color,
      done: Boolean(t.completed_at),
      courseId: t.course ?? undefined,
    })
  }

  for (const e of events) {
    const course = e.course ? courseById.get(e.course) : undefined
    items.push({
      key: `event-${e.id}`,
      kind: 'event',
      title: e.title,
      start: new Date(e.start_at),
      end: new Date(e.end_at),
      color: course?.color,
      done: Boolean(e.completed_at),
      event: e,
      location: e.location,
    })
  }

  return items.sort((a, b) => a.start.getTime() - b.start.getTime())
}

export function itemsOn(items: CalendarItem[], day: Date) {
  return items.filter((i) => sameDay(i.start, day))
}
