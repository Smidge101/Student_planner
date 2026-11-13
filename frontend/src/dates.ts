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
