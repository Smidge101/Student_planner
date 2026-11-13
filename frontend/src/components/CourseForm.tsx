import { Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { ApiError } from '../api'
import { WEEKDAYS } from '../dates'
import { useSaveCourse } from '../queries'
import { PALETTE, PALETTE_KEYS } from '../theme'
import type { Course, Meeting, PastelColor } from '../types'

const NEW_MEETING: Meeting = { weekday: 0, start_time: '10:00', end_time: '11:00', location: '' }

/** Add or edit a class. `takenColors` maps colors to the class already using them. */
export default function CourseForm({
  course,
  takenColors,
  onDone,
}: {
  course?: Course
  takenColors: Map<PastelColor, string>
  onDone: (saved: Course) => void
}) {
  const save = useSaveCourse()
  const firstFree = PALETTE_KEYS.find((c) => !takenColors.has(c))
  const [name, setName] = useState(course?.name ?? '')
  const [color, setColor] = useState<PastelColor | undefined>(course?.color ?? firstFree)
  const [meetings, setMeetings] = useState<Meeting[]>(
    course?.meetings.map((m) => ({ ...m, start_time: m.start_time.slice(0, 5), end_time: m.end_time.slice(0, 5) })) ?? [],
  )

  const error = save.error instanceof ApiError ? save.error : null
  const meetingErrors = (error?.data as { meetings?: Record<string, string[]>[] } | null)?.meetings

  function updateMeeting(index: number, patch: Partial<Meeting>) {
    setMeetings((list) => list.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!color) return
    save.mutate(
      { id: course?.id, data: { name, color, meetings } },
      { onSuccess: (saved) => onDone(saved) },
    )
  }

  return (
    <form className="form modal-form" onSubmit={onSubmit} noValidate>
      {error?.detail && <p className="form-error" role="alert">{error.detail}</p>}

      <label className="field">
        <span>Class name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required data-autofocus maxLength={100} placeholder="e.g. Biology 101" />
        {error?.field('name') && <small className="field-error">{error.field('name')}</small>}
      </label>

      <fieldset className="field">
        <legend>Color</legend>
        {firstFree === undefined && !course && (
          <small className="field-error">All 8 colors are in use. Delete a class to free one up.</small>
        )}
        <div className="swatches swatches-wide" role="radiogroup" aria-label="Class color">
          {PALETTE_KEYS.map((key) => {
            const owner = takenColors.get(key)
            return (
              <button
                type="button"
                key={key}
                role="radio"
                aria-checked={color === key}
                aria-label={owner ? `${PALETTE[key].label} (used by ${owner})` : PALETTE[key].label}
                title={owner ? `Used by ${owner}` : PALETTE[key].label}
                className="swatch"
                style={{ background: PALETTE[key].hex }}
                disabled={Boolean(owner)}
                onClick={() => setColor(key)}
              />
            )
          })}
        </div>
        {error?.field('color') && <small className="field-error">{error.field('color')}</small>}
      </fieldset>

      <fieldset className="field">
        <legend>Meeting times</legend>
        <small className="field-hint">These show up on your calendar every week.</small>
        {meetings.map((m, i) => {
          const rowError = meetingErrors?.[i] && Object.values(meetingErrors[i]).flat().join(' ')
          return (
            <div key={i} className="meeting-row">
              <select
                aria-label={`Day for meeting ${i + 1}`}
                value={m.weekday}
                onChange={(e) => updateMeeting(i, { weekday: Number(e.target.value) })}
              >
                {WEEKDAYS.map((day, d) => <option key={day} value={d}>{day}</option>)}
              </select>
              <input type="time" aria-label={`Start time for meeting ${i + 1}`} value={m.start_time}
                onChange={(e) => updateMeeting(i, { start_time: e.target.value })} required />
              <input type="time" aria-label={`End time for meeting ${i + 1}`} value={m.end_time}
                onChange={(e) => updateMeeting(i, { end_time: e.target.value })} required />
              <input aria-label={`Location for meeting ${i + 1}`} placeholder="Room (optional)" value={m.location}
                onChange={(e) => updateMeeting(i, { location: e.target.value })} maxLength={100} />
              <button type="button" className="icon-button" aria-label={`Remove meeting ${i + 1}`}
                onClick={() => setMeetings((list) => list.filter((_, j) => j !== i))}>
                <Trash2 aria-hidden="true" />
              </button>
              {rowError && <small className="field-error meeting-error">{rowError}</small>}
            </div>
          )
        })}
        <button
          type="button"
          className="btn btn-ghost btn-sm add-row"
          onClick={() =>
            setMeetings((list) => {
              // Copy the last row's time two days later (Mon -> Wed -> Fri).
              const last = list[list.length - 1]
              return [...list, last ? { ...last, weekday: (last.weekday + 2) % 7 } : NEW_MEETING]
            })
          }
        >
          <Plus aria-hidden="true" /> Add meeting time
        </button>
      </fieldset>

      <button className="btn btn-primary btn-block" disabled={save.isPending || !name.trim() || !color}>
        {save.isPending ? 'Saving…' : course ? 'Save changes' : 'Add class'}
      </button>
    </form>
  )
}
