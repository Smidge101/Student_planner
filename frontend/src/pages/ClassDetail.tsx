import { ArrowLeft, Check, Pencil, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '../api'
import CourseForm from '../components/CourseForm'
import Modal, { ConfirmDialog } from '../components/Modal'
import TaskForm from '../components/TaskForm'
import { formatDue, formatMeetings } from '../dates'
import {
  takenColorsExcept,
  useAssignments,
  useCourse,
  useCourses,
  useDeleteAssignment,
  useToggleAssignment,
} from '../queries'
import { courseColorStyle } from '../theme'
import { useToast } from '../toast'
import type { Assignment } from '../types'
import { DeleteCourseDialog } from './Classes'

export default function ClassDetail() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const course = useCourse(id)
  const courses = useCourses()
  const tasks = useAssignments(id)
  const [editing, setEditing] = useState(false)
  const [deletingCourse, setDeletingCourse] = useState(false)
  const [editingTask, setEditingTask] = useState<Assignment | null>(null)
  const [deletingTask, setDeletingTask] = useState<Assignment | null>(null)
  const [showDone, setShowDone] = useState(false)

  const open = useMemo(() => (tasks.data ?? []).filter((t) => !t.completed_at), [tasks.data])
  const done = useMemo(
    () => (tasks.data ?? []).filter((t) => t.completed_at).sort((a, b) => b.completed_at!.localeCompare(a.completed_at!)),
    [tasks.data],
  )

  if (course.isPending) return <p className="muted" role="status">Loading…</p>
  if (course.isError) {
    const missing = course.error instanceof ApiError && course.error.status === 404
    return (
      <div className="card empty-page">
        <p>{missing ? "That class doesn't exist (or isn't yours)." : "Couldn't load this class."}</p>
        <Link to="/classes" className="btn btn-primary">Back to classes</Link>
      </div>
    )
  }
  const c = course.data

  return (
    <div className="class-page" style={courseColorStyle(c.color)}>
      <Link to="/classes" className="back-link"><ArrowLeft aria-hidden="true" /> All classes</Link>

      <header className="card class-header">
        <div>
          <h1>{c.name}</h1>
          <p className="muted">{formatMeetings(c.meetings)}</p>
          {c.meetings.some((m) => m.location) && (
            <p className="muted small">{[...new Set(c.meetings.map((m) => m.location).filter(Boolean))].join(' · ')}</p>
          )}
        </div>
        <div className="class-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" /> Edit
          </button>
          <button className="btn btn-ghost btn-sm danger-text" onClick={() => setDeletingCourse(true)}>
            <Trash2 aria-hidden="true" /> Delete
          </button>
        </div>
      </header>

      <section className="card panel" aria-labelledby="add-work-heading">
        <h2 id="add-work-heading">Add work</h2>
        <TaskForm courseId={c.id} />
      </section>

      <section className="card panel" aria-labelledby="todo-heading">
        <h2 id="todo-heading">To do <span className="count">{open.length}</span></h2>
        {tasks.isPending && <p className="muted" role="status">Loading tasks…</p>}
        {tasks.data && open.length === 0 && <p className="empty">Nothing due. Nice!</p>}
        <ul className="task-list">
          {open.map((t) => (
            <TaskRow key={t.id} task={t} onEdit={setEditingTask} onDelete={setDeletingTask} />
          ))}
        </ul>

        {done.length > 0 && (
          <>
            <button className="link-button done-toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
              {showDone ? 'Hide' : 'Show'} completed ({done.length})
            </button>
            {showDone && (
              <ul className="task-list">
                {done.map((t) => (
                  <TaskRow key={t.id} task={t} onEdit={setEditingTask} onDelete={setDeletingTask} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {editing && (
        <Modal title={`Edit ${c.name}`} onClose={() => setEditing(false)}>
          <CourseForm course={c} takenColors={takenColorsExcept(courses.data, c)} onDone={() => setEditing(false)} />
        </Modal>
      )}
      {deletingCourse && (
        <DeleteCourseDialog
          course={c}
          onClose={() => setDeletingCourse(false)}
          onDeleted={() => navigate('/classes', { replace: true })}
        />
      )}
      {editingTask && (
        <Modal title="Edit task" onClose={() => setEditingTask(null)}>
          <TaskForm courseId={c.id} task={editingTask} onDone={() => setEditingTask(null)} />
        </Modal>
      )}
      {deletingTask && <DeleteTaskDialog task={deletingTask} onClose={() => setDeletingTask(null)} />}
    </div>
  )
}

function TaskRow({
  task,
  onEdit,
  onDelete,
}: {
  task: Assignment
  onEdit: (t: Assignment) => void
  onDelete: (t: Assignment) => void
}) {
  const toggle = useToggleAssignment()
  const toast = useToast()
  const isDone = Boolean(task.completed_at)
  const overdue = !isDone && new Date(task.due_at) < new Date()

  return (
    <li className={`task-row${isDone ? ' done' : ''}`}>
      <button
        className="check-button"
        role="checkbox"
        aria-checked={isDone}
        aria-label={`${isDone ? 'Mark not done' : 'Mark done'}: ${task.title}`}
        disabled={toggle.isPending}
        onClick={() =>
          toggle.mutate(
            { id: task.id, done: !isDone },
            {
              onSuccess: ({ xp_change }) => {
                if (xp_change > 0) toast({ title: `+${xp_change} XP`, text: `Finished "${task.title}"` })
                if (xp_change < 0) toast({ title: `${xp_change} XP`, text: 'Marked as not done' })
              },
              onError: () => toast({ title: "Couldn't update that task", text: 'Please try again.' }),
            },
          )
        }
      >
        {isDone && <Check aria-hidden="true" />}
      </button>
      <div className="task-info">
        <p className="item-title">{task.title}</p>
        <p className={`item-meta${overdue ? ' overdue' : ''}`}>
          {isDone ? 'Done' : formatDue(task.due_at)} · <span className={`kind kind-${task.kind}`}>{task.kind}</span>
        </p>
        {task.description && <p className="task-notes-text">{task.description}</p>}
      </div>
      <span className="xp-chip">+{task.xp} XP</span>
      <div className="row-actions">
        <button className="icon-button" aria-label={`Edit ${task.title}`} onClick={() => onEdit(task)}>
          <Pencil aria-hidden="true" />
        </button>
        <button className="icon-button" aria-label={`Delete ${task.title}`} onClick={() => onDelete(task)}>
          <Trash2 aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

function DeleteTaskDialog({ task, onClose }: { task: Assignment; onClose: () => void }) {
  const remove = useDeleteAssignment()
  return (
    <ConfirmDialog
      title={`Delete "${task.title}"?`}
      message={<p>This can't be undone.{task.completed_at && ' XP you earned for it stays.'}</p>}
      confirmLabel="Delete task"
      pending={remove.isPending}
      error={remove.isError ? "Couldn't delete the task." : undefined}
      onClose={onClose}
      onConfirm={() => remove.mutate(task.id, { onSuccess: onClose })}
    />
  )
}
