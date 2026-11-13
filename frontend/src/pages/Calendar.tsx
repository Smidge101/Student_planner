import { BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardList, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { buildItems, itemsOn, type CalendarItem, type ItemKind } from '../calendar'
import EventForm from '../components/EventForm'
import Modal, { ConfirmDialog } from '../components/Modal'
import {
  addDays,
  formatFullDay,
  formatMonthTitle,
  formatRange,
  formatTime,
  formatWeekTitle,
  sameDay,
  startOfDay,
  startOfWeek,
} from '../dates'
import { useCalendarRange, useCourses, useDeleteEvent, useToggleEvent } from '../queries'
import { courseColorStyle } from '../theme'
import { useToast } from '../toast'
import type { CalendarEvent, Course } from '../types'

type View = 'month' | 'week'
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_CHIPS = 3
const KIND_LABEL: Record<ItemKind, string> = { class: 'Classes', task: 'Due dates', event: 'Events' }
const KIND_ICON = { class: BookOpen, task: ClipboardList, event: CalendarDays }

export default function Calendar() {
  const navigate = useNavigate()
  const [view, setView] = useState<View>(() => (window.innerWidth < 760 ? 'week' : 'month'))
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const [shown, setShown] = useState<Record<ItemKind, boolean>>({ class: true, task: true, event: true })
  const [adding, setAdding] = useState<Date | null>(null)
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null)

  // Month view: the 6 weeks that cover the month. Week view: Sun–Sat.
  const start = view === 'month'
    ? startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1))
    : startOfWeek(anchor)
  const days = view === 'month' ? 42 : 7
  const end = addDays(start, days)

  const courses = useCourses()
  const { events, tasks } = useCalendarRange(start, end)
  const items = useMemo(
    () =>
      buildItems(start, end, courses.data ?? [], tasks.data ?? [], events.data ?? []).filter((i) => shown[i.kind]),
    // start/end are derived from anchor + view
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchor, view, courses.data, tasks.data, events.data, shown],
  )
  const loading = courses.isPending || events.isPending || tasks.isPending
  const failed = courses.isError || events.isError || tasks.isError

  function move(direction: 1 | -1) {
    setAnchor((a) =>
      view === 'month' ? new Date(a.getFullYear(), a.getMonth() + direction, 1) : addDays(a, 7 * direction),
    )
  }

  function openItem(item: CalendarItem) {
    if (item.kind === 'event' && item.event) setOpenEvent(item.event)
    else if (item.courseId) navigate(`/classes/${item.courseId}`)
  }

  const today = new Date()
  const gridDays = Array.from({ length: days }, (_, i) => addDays(start, i))

  return (
    <div className="calendar-page">
      <div className="page-head">
        <h1 className="page-title">Calendar</h1>
        <button className="btn btn-primary" onClick={() => setAdding(anchor)}>
          <Plus aria-hidden="true" /> Add event
        </button>
      </div>

      <div className="card calendar-card">
        <div className="calendar-toolbar">
          <div className="calendar-nav">
            <button className="icon-button" onClick={() => move(-1)} aria-label={`Previous ${view}`}><ChevronLeft aria-hidden="true" /></button>
            <h2 aria-live="polite">{view === 'month' ? formatMonthTitle(anchor) : formatWeekTitle(start)}</h2>
            <button className="icon-button" onClick={() => move(1)} aria-label={`Next ${view}`}><ChevronRight aria-hidden="true" /></button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAnchor(startOfDay(new Date()))}>Today</button>
          </div>
          <div className="segmented" role="group" aria-label="Calendar view">
            {(['month', 'week'] as View[]).map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
                {v === 'month' ? 'Month' : 'Week'}
              </button>
            ))}
          </div>
        </div>

        <div className="calendar-filters" role="group" aria-label="Show on calendar">
          {(Object.keys(KIND_LABEL) as ItemKind[]).map((kind) => {
            const Icon = KIND_ICON[kind]
            return (
              <label key={kind} className="filter-chip">
                <input type="checkbox" checked={shown[kind]} onChange={(e) => setShown((s) => ({ ...s, [kind]: e.target.checked }))} />
                <Icon aria-hidden="true" /> {KIND_LABEL[kind]}
              </label>
            )
          })}
          {loading && <span className="muted small" role="status">Loading…</span>}
          {failed && <span className="field-error" role="alert">Couldn't load everything. Try refreshing.</span>}
        </div>

        {view === 'month' ? (
          <div className="month-grid" role="grid" aria-label={formatMonthTitle(anchor)}>
            <div className="month-row month-head" role="row">
              {WEEKDAY_NAMES.map((d) => <div key={d} role="columnheader" className="month-dayname">{d}</div>)}
            </div>
            {Array.from({ length: 6 }, (_, w) => (
              <div className="month-row" role="row" key={w}>
                {gridDays.slice(w * 7, w * 7 + 7).map((day) => {
                  const dayItems = itemsOn(items, day)
                  const extra = dayItems.length - MONTH_CHIPS
                  return (
                    <div
                      key={day.toDateString()}
                      role="gridcell"
                      className={`month-cell${day.getMonth() !== anchor.getMonth() ? ' other-month' : ''}${sameDay(day, today) ? ' today' : ''}`}
                    >
                      <button className="day-number" onClick={() => setAdding(day)} aria-label={`Add event on ${formatFullDay(day)}`}>
                        {day.getDate()}
                      </button>
                      {dayItems.slice(0, MONTH_CHIPS).map((item) => (
                        <ItemChip key={item.key} item={item} compact onOpen={openItem} />
                      ))}
                      {extra > 0 && (
                        <button className="more-link" onClick={() => { setAnchor(day); setView('week') }}>
                          +{extra} more
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="week-grid">
            {gridDays.map((day) => {
              const dayItems = itemsOn(items, day)
              return (
                <section key={day.toDateString()} className={`week-day${sameDay(day, today) ? ' today' : ''}`} aria-label={formatFullDay(day)}>
                  <header className="week-day-head">
                    <span className="muted">{WEEKDAY_NAMES[day.getDay()]}</span>
                    <span className="week-date">{day.getDate()}</span>
                    <button className="icon-button" onClick={() => setAdding(day)} aria-label={`Add event on ${formatFullDay(day)}`}>
                      <Plus aria-hidden="true" />
                    </button>
                  </header>
                  {dayItems.length === 0 && <p className="muted small week-empty">Free</p>}
                  {dayItems.map((item) => <ItemChip key={item.key} item={item} onOpen={openItem} />)}
                </section>
              )
            })}
          </div>
        )}
      </div>

      {adding && (
        <Modal title="Add an event" onClose={() => setAdding(null)}>
          <EventForm day={adding} onDone={() => setAdding(null)} />
        </Modal>
      )}
      {openEvent && (
        <EventDetails event={openEvent} courses={courses.data ?? []} onClose={() => setOpenEvent(null)} />
      )}
    </div>
  )
}

function ItemChip({ item, compact, onOpen }: { item: CalendarItem; compact?: boolean; onOpen: (i: CalendarItem) => void }) {
  const Icon = KIND_ICON[item.kind]
  const what = item.kind === 'task' ? 'Due' : item.kind === 'class' ? 'Class' : 'Event'
  const timeText = formatTime(item.start)
  return (
    <button
      className={`chip chip-${item.kind}${item.done ? ' chip-done' : ''}`}
      style={courseColorStyle(item.color)}
      onClick={() => onOpen(item)}
      title={`${what}: ${item.title} · ${timeText}${item.location ? ` · ${item.location}` : ''}`}
    >
      {item.done ? <Check aria-hidden="true" /> : <Icon aria-hidden="true" />}
      {!compact && <span className="chip-time">{timeText}</span>}
      <span className="chip-title">
        <span className="sr-only">{what}{item.done ? ' (done)' : ''}: </span>
        {item.title}
      </span>
    </button>
  )
}

function EventDetails({ event, courses, onClose }: { event: CalendarEvent; courses: Course[]; onClose: () => void }) {
  const toggle = useToggleEvent()
  const toast = useToast()
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const remove = useDeleteEvent()
  const course = courses.find((c) => c.id === event.course)
  const done = Boolean(event.completed_at)

  if (mode === 'edit') {
    return (
      // Keys make React open a fresh dialog (and move focus) when switching views.
      <Modal key="edit" title="Edit event" onClose={onClose}>
        <EventForm event={event} onDone={onClose} />
      </Modal>
    )
  }
  if (mode === 'delete') {
    return (
      <ConfirmDialog
        title={`Delete "${event.title}"?`}
        message={<p>This can't be undone.{done && ' XP you earned for it stays.'}</p>}
        confirmLabel="Delete event"
        pending={remove.isPending}
        error={remove.isError ? "Couldn't delete the event." : undefined}
        onClose={() => setMode('view')}
        onConfirm={() => remove.mutate(event.id, { onSuccess: onClose })}
      />
    )
  }

  return (
    <Modal key="view" title={event.title} onClose={onClose} size="sm">
      <div className="event-details">
        <p>{formatRange(new Date(event.start_at), new Date(event.end_at))}</p>
        {event.location && <p className="muted"><MapPin aria-hidden="true" /> {event.location}</p>}
        {course && <p className="course-tag" style={courseColorStyle(course.color)}>{course.name}</p>}
        {event.description && <p className="task-notes-text">{event.description}</p>}
      </div>
      <div className="modal-actions">
        <button className="icon-button" aria-label="Edit event" onClick={() => setMode('edit')}><Pencil aria-hidden="true" /></button>
        <button className="icon-button" aria-label="Delete event" onClick={() => setMode('delete')}><Trash2 aria-hidden="true" /></button>
        <button
          className={`btn ${done ? 'btn-ghost' : 'btn-primary'}`}
          data-autofocus
          disabled={toggle.isPending}
          onClick={() =>
            toggle.mutate(
              { id: event.id, done: !done },
              {
                onSuccess: ({ xp_change }) => {
                  if (xp_change !== 0) toast({ title: `${xp_change > 0 ? '+' : ''}${xp_change} XP`, text: xp_change > 0 ? `Finished "${event.title}"` : 'Marked as not done' })
                  onClose()
                },
                onError: () => toast({ title: "Couldn't update that event", text: 'Please try again.' }),
              },
            )
          }
        >
          {done ? 'Mark not done' : `Mark done · +${event.xp} XP`}
        </button>
      </div>
    </Modal>
  )
}
