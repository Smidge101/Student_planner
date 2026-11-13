import { useState, type FormEvent } from 'react'

import { ApiError } from '../api'
import { defaultDue, toLocalInput } from '../dates'
import { useSaveAssignment } from '../queries'
import type { Assignment, TaskKind } from '../types'

const KIND_LABELS: Record<TaskKind, string> = {
  homework: 'Homework · 5 XP',
  quiz: 'Quiz · 10 XP',
  exam: 'Exam · 15 XP',
}

/** Add work to a class, or edit an existing task. */
export default function TaskForm({
  courseId,
  task,
  onDone,
}: {
  courseId: number
  task?: Assignment
  onDone?: (saved: Assignment) => void
}) {
  const save = useSaveAssignment()
  const [title, setTitle] = useState(task?.title ?? '')
  const [kind, setKind] = useState<TaskKind>(task?.kind ?? 'homework')
  const [due, setDue] = useState(task ? toLocalInput(new Date(task.due_at)) : defaultDue())
  const [description, setDescription] = useState(task?.description ?? '')
  const error = save.error instanceof ApiError ? save.error : null
  const idPrefix = task ? `task-${task.id}` : 'new-task'

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    save.mutate(
      {
        id: task?.id,
        data: {
          title,
          kind,
          description,
          course: courseId,
          due_at: new Date(due).toISOString(), // local time -> UTC
        },
      },
      {
        onSuccess: (saved) => {
          if (!task) {
            // Keep the type and due date: adding several similar tasks is common.
            setTitle('')
            setDescription('')
          }
          onDone?.(saved)
        },
      },
    )
  }

  return (
    <form className="form task-form" onSubmit={onSubmit} noValidate>
      {error?.detail && <p className="form-error" role="alert">{error.detail}</p>}
      <label className="field task-title" htmlFor={`${idPrefix}-title`}>
        <span>What's due?</span>
        <input id={`${idPrefix}-title`} value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Chapter 4 problems" maxLength={200} required data-autofocus={task ? true : undefined} />
        {error?.field('title') && <small className="field-error">{error.field('title')}</small>}
      </label>
      <label className="field" htmlFor={`${idPrefix}-kind`}>
        <span>Type</span>
        <select id={`${idPrefix}-kind`} value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
          {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {error?.field('kind') && <small className="field-error">{error.field('kind')}</small>}
      </label>
      <label className="field" htmlFor={`${idPrefix}-due`}>
        <span>Due</span>
        <input id={`${idPrefix}-due`} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} required />
        {error?.field('due_at') && <small className="field-error">{error.field('due_at')}</small>}
      </label>
      <label className="field task-notes" htmlFor={`${idPrefix}-notes`}>
        <span>Notes <span className="muted">(optional)</span></span>
        <textarea id={`${idPrefix}-notes`} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </label>
      <button className="btn btn-primary task-submit" disabled={save.isPending || !title.trim() || !due}>
        {save.isPending ? 'Saving…' : task ? 'Save changes' : 'Add work'}
      </button>
    </form>
  )
}
