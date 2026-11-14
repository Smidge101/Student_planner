// Timer state for the Pomodoro page, kept in localStorage so a reload or a
// closed tab can pick up where it left off. Times are absolute (Date.now()
// based), so a background tab that the browser slows down stays accurate.

export type Phase = 'work' | 'break'

export interface TimerState {
  sessionId: number
  phase: Phase
  /** 0-based index of the current set. */
  set: number
  sets: number
  workMs: number
  breakMs: number
  /** When the current phase ends (ms since epoch), or null while paused. */
  endsAt: number | null
  /** Time left in the phase while paused. */
  pausedLeft: number | null
}

const KEY = 'studywebplanner:pomodoro'

export function loadTimer(): TimerState | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as TimerState) : null
  } catch {
    return null
  }
}

export function saveTimer(state: TimerState | null) {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state))
    else localStorage.removeItem(KEY)
  } catch {
    // Private mode or storage blocked: the timer still works, it just won't survive a reload.
  }
}

export function timeLeft(state: TimerState, now = Date.now()) {
  if (state.endsAt === null) return state.pausedLeft ?? 0
  return Math.max(0, state.endsAt - now)
}

export function phaseLength(state: TimerState) {
  return state.phase === 'work' ? state.workMs : state.breakMs
}

/** 1500000 -> "25:00", 3725000 -> "1:02:05" */
export function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  return h ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm.padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 160 -> "2h 40m" */
export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || '0m'
}

/** Same rules as the server: 1 XP per 5 work minutes per block, +1 per 10 total minutes when finished. */
export function previewXp(work: number, sets: number) {
  const block = Math.max(1, Math.floor(work / 5))
  return { block, bonus: Math.floor((work * sets) / 10), total: block * sets + Math.floor((work * sets) / 10) }
}

/** A soft two-note chime made with the Web Audio API (no sound files needed). */
export function chime() {
  try {
    const ctx = new AudioContext()
    const notes = [660, 880]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const start = ctx.currentTime + i * 0.22
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.18, start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.65)
    })
    window.setTimeout(() => ctx.close(), 1500)
  } catch {
    // Audio unavailable: the visual change is enough.
  }
}
