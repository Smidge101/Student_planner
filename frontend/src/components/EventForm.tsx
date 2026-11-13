import { useState, type FormEvent } from 'react'

import { ApiError } from '../api'
import { toLocalInput } from '../dates'
import { useCourses, useSaveEvent } from '../queries'
import type { CalendarEvent } from '../types'

/** Add or edit a calendar event. New events default to `day` at 4–5 PM. */
export default function EventForm({
  event,
  day,
  onDone,
}: {
  event?: CalendarEvent
  day?: Date
  onDone: (saved: CalendarEvent) => void
}) {
  const save = useSaveEvent()
  const courses = useCourses()
  const base = day ?? new Date()
  const [title, setTitle] = useState(event?.title ?? '')
  const [start, setStart] = useState(
    event ? toLocalInput(new Date(event.start_at)) : toLocalInput(new Date(base.getFullYear(), base.getMonth(), base.getDate(), 16)),
  )
  const [end, setEnd] = useState(
    event ? toLocalInput(new Date(event.end_at)) : toLocalInput(new Date(base.getFullYear(), base.getMonth(), base.getDate(), 17)),
  )
  const [location, setLocation] = useState(event?.location ?? '')
  const [course, setCourse] = useState<number | null>(event?.course ?? null)
  const [description, setDescription] = useState(event?.description ?? '')

  const error = save.error instanceof ApiError ? save.error : null
  const endBeforeStart = start !== '' && end !== '' && new Date(end) < new Date(start)

  function changeStart(value: string) {
    // Keep the same length when the start moves, like most calendars do.
    if (value && start && end && !endBeforeStart) {
      const length = new Date(end).getTime() - new Date(start).getTime()
      setEnd(toLocalInput(new Date(new Date(value).getTime() + length)))
    }
    setStart(value)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (endBeforeStart) return
    save.mutate(
      {
        id: event?.id,
        data: {
          title,
          location,
          description,
          course,
          start_at: new Date(start).toISOString(),
          end_at: new Date(end).toISOString(),
        },
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form className="form modal-form event-form" onSubmit={onSubmit} noValidate>
      {error?.detail && <p className="form-error" role="alert">{error.detail}</p>}
      <label className="field event-wide">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Study session"
          maxLength={200} required data-autofocus />
        {error?.field('title') && <small className="field-error">{error.field('title')}</small>}
      </label>
      <label className="field">
        <span>Starts</span>
        <input type="datetime-local" value={start} onChange={(e) => changeStart(e.target.value)} required />
      </label>
      <label className="field">
        <span>Ends</span>
        <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required
          aria-invalid={endBeforeStart || undefined} />
        {(endBeforeStart || error?.field('end_at')) && (
          <small className="field-error">{endBeforeStart ? 'Must be after the start.' : error?.field('end_at')}</small>
        )}
      </label>
      <label className="field">
        <span>Place <span className="muted">(optional)</span></span>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Library" maxLength={100} />
      </label>
      <label className="field">
        <span>Class <span className="muted">(optional)</span></span>
        <select value={course ?? ''} onChange={(e) => setCourse(e.target.value ? Number(e.target.value) : null)}>
          <option value="">None</option>
          {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="field event-wide">
        <span>Notes <span className="muted">(optional)</span></span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </label>
      <button className="btn btn-primary btn-block event-wide" disabled={save.isPending || !title.trim() || !start || !end || endBeforeStart}>
        {save.isPending ? 'Saving…' : event ? 'Save changes' : 'Add event'}
      </button>
    </form>
  )
}
