import { BookOpen, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { ApiError } from '../api'
import CourseForm from '../components/CourseForm'
import Modal, { ConfirmDialog } from '../components/Modal'
import { formatMeetings } from '../dates'
import { takenColorsExcept, useCourses, useDeleteCourse } from '../queries'
import { courseColorStyle } from '../theme'
import { useToast } from '../toast'
import type { Course } from '../types'

export default function Classes() {
  const courses = useCourses()
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<Course | null>(null)
  const toast = useToast()
  const taken = useMemo(() => takenColorsExcept(courses.data), [courses.data])

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">My Classes</h1>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" /> Add class
        </button>
      </div>

      {courses.isPending && <p className="muted" role="status">Loading your classes…</p>}
      {courses.isError && (
        <p className="form-error" role="alert">
          Couldn't load your classes.{' '}
          <button className="link-button" onClick={() => courses.refetch()}>Try again</button>
        </p>
      )}

      {courses.data?.length === 0 && (
        <div className="card empty-page">
          <BookOpen aria-hidden="true" />
          <p>No classes yet. Add your first one to start tracking its work.</p>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>Add a class</button>
        </div>
      )}

      <ul className="course-grid">
        {courses.data?.map((course) => (
          <li key={course.id} className="course-card card" style={courseColorStyle(course.color)}>
            <span className="course-icon" aria-hidden="true"><BookOpen /></span>
            <div className="course-info">
              <h2>
                {/* The whole card is clickable through this link's ::after. */}
                <Link to={`/classes/${course.id}`} className="course-link">{course.name}</Link>
              </h2>
              <p className="muted">{formatMeetings(course.meetings)}</p>
              <p className="course-count">
                {course.open_tasks === 0 ? 'No open tasks' : `${course.open_tasks} open task${course.open_tasks === 1 ? '' : 's'}`}
              </p>
            </div>
            <button
              className="icon-button course-delete"
              aria-label={`Delete ${course.name}`}
              onClick={() => setDeleting(course)}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      {adding && (
        <Modal title="Add a class" onClose={() => setAdding(false)}>
          <CourseForm
            takenColors={taken}
            onDone={(saved) => {
              setAdding(false)
              toast({ title: `Added ${saved.name}` })
            }}
          />
        </Modal>
      )}

      {deleting && (
        <DeleteCourseDialog course={deleting} onClose={() => setDeleting(null)} />
      )}
    </>
  )
}

export function DeleteCourseDialog({
  course,
  onClose,
  onDeleted,
}: {
  course: Course
  onClose: () => void
  onDeleted?: () => void
}) {
  const remove = useDeleteCourse()
  const toast = useToast()
  return (
    <ConfirmDialog
      title={`Delete ${course.name}?`}
      message={
        <p>
          This also deletes all of this class's assignments and events. This can't be undone.
          {' '}<strong>XP you've already earned stays.</strong>
        </p>
      }
      confirmLabel="Delete class"
      pending={remove.isPending}
      error={remove.error instanceof ApiError ? remove.error.detail || "Couldn't delete the class." : undefined}
      onClose={onClose}
      onConfirm={() =>
        remove.mutate(course.id, {
          onSuccess: () => {
            onClose()
            toast({ title: `Deleted ${course.name}` })
            onDeleted?.()
          },
        })
      }
    />
  )
}
