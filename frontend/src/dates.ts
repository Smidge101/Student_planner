// Friendly date labels, in the browser's time zone.

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

function dayDiff(date: Date, now = new Date()) {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((start(date) - start(now)) / 86_400_000)
}

function dayLabel(date: Date) {
  const diff = dayDiff(date)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return weekday.format(date)
  return shortDate.format(date)
}

/** "Due Tomorrow, 11:59 PM" or "Overdue since Nov 3". */
export function formatDue(iso: string) {
  const date = new Date(iso)
  if (date < new Date()) return `Overdue since ${dayLabel(date)}`
  return `Due ${dayLabel(date)}, ${time.format(date)}`
}

/** "Today · 2:00 PM" */
export function formatEventTime(iso: string) {
  const date = new Date(iso)
  return `${dayLabel(date)} · ${time.format(date)}`
}

// ---------- Class meeting times ----------

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_SHORT = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su']

/** "10:00:00" -> "10:00 AM" */
export function formatClockTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return time.format(new Date(2000, 0, 1, h, m))
}

/** Groups meetings that share a time: "MW · 10:00 AM – 11:15 AM, F · 1:00 PM – 2:00 PM". */
export function formatMeetings(meetings: { weekday: number; start_time: string; end_time: string }[]) {
  if (meetings.length === 0) return 'No meeting times yet'
  const groups = new Map<string, number[]>()
  for (const m of meetings) {
    const key = `${m.start_time}|${m.end_time}`
    groups.set(key, [...(groups.get(key) ?? []), m.weekday])
  }
  return [...groups.entries()]
    .map(([key, days]) => {
      const [start, end] = key.split('|')
      const dayText = [...days].sort((a, b) => a - b).map((d) => DAY_SHORT[d]).join('')
      return `${dayText} · ${formatClockTime(start)} – ${formatClockTime(end)}`
    })
    .join(', ')
}

// ---------- <input type="datetime-local"> ----------

const pad = (n: number) => String(n).padStart(2, '0')

/** Date -> "2026-11-12T23:59" in local time, for datetime-local inputs. */
export function toLocalInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Default due date for new work: tomorrow at 11:59 PM. */
export function defaultDue() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(23, 59, 0, 0)
  return toLocalInput(d)
}

// ---------- Calendar grid ----------

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes())
}

/** The Sunday that starts d's week (the calendar shows Sun–Sat, like the mockup). */
export function startOfWeek(d: Date) {
  return addDays(startOfDay(d), -d.getDay())
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Our meetings use 0 = Monday; JavaScript's getDay() uses 0 = Sunday. */
export function meetingWeekday(d: Date) {
  return (d.getDay() + 6) % 7
}

/** A Date on `day` at "HH:MM[:SS]". */
export function atTime(day: Date, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
}

const monthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const dayMonth = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const fullDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

export const formatMonthTitle = (d: Date) => monthTitle.format(d)
export const formatFullDay = (d: Date) => fullDay.format(d)
export const formatTime = (d: Date) => time.format(d)

/** "Nov 8 – Nov 14, 2026" */
export function formatWeekTitle(start: Date) {
  const end = addDays(start, 6)
  return `${dayMonth.format(start)} – ${dayMonth.format(end)}, ${end.getFullYear()}`
}

/** "Thursday, November 12 · 4:00 PM – 5:00 PM" */
export function formatRange(start: Date, end: Date) {
  const sameDate = sameDay(start, end)
  return sameDate
    ? `${fullDay.format(start)} · ${time.format(start)} – ${time.format(end)}`
    : `${fullDay.format(start)}, ${time.format(start)} – ${fullDay.format(end)}, ${time.format(end)}`
}
