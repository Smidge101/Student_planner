import { Bell, BellOff, Coffee, Music, Pause, Play, Square, Timer, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError } from '../api'
import { ConfirmDialog } from '../components/Modal'
import {
  chime,
  formatClock,
  formatMinutes,
  loadTimer,
  phaseLength,
  previewXp,
  saveTimer,
  timeLeft,
  type TimerState,
} from '../pomodoro'
import { LOFI_TRACKS } from '../pomodoroMedia'
import { useActivePomodoro, useCompletePomodoroSet, useStartPomodoro, useStopPomodoro } from '../queries'
import { useToast } from '../toast'
import type { PomodoroSession } from '../types'

const WORK_PRESETS = [25, 30, 45, 50]
const BREAK_PRESETS = [5, 10, 15]
const MAX_WORK_MINUTES = 6 * 60
const PREFS_KEY = 'studywebplanner:pomodoro-prefs'

interface Prefs {
  work: number
  rest: number
  sets: number
  sound: boolean
  music: boolean
}

function loadPrefs(): Prefs {
  const fallback = { work: 25, rest: 5, sets: 4, sound: true, music: false }
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    return fallback
  }
}

function timerFromSession(s: PomodoroSession): TimerState {
  // Used when the server has a running session but this browser has no saved
  // timer (e.g. another device): pick up at the next unfinished set.
  return {
    sessionId: s.id,
    phase: 'work',
    set: s.completed_sets,
    sets: s.planned_sets,
    workMs: s.work_minutes * 60_000,
    breakMs: s.break_minutes * 60_000,
    endsAt: null,
    pausedLeft: s.work_minutes * 60_000,
  }
}

export default function Pomodoro() {
  const toast = useToast()
  const active = useActivePomodoro()
  const start = useStartPomodoro()
  const { mutate: reportSet } = useCompletePomodoroSet()
  const stop = useStopPomodoro()

  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [timer, setTimer] = useState<TimerState | null>(() => loadTimer())
  const [now, setNow] = useState(() => Date.now())
  const [confirmStop, setConfirmStop] = useState(false)
  const [earned, setEarned] = useState(0)
  const reporting = useRef(false)
  const audio = useRef<HTMLAudioElement>(null)

  const updatePrefs = (patch: Partial<Prefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch }
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })

  // Keep the saved timer in step with the server: drop it if the session
  // ended elsewhere, or rebuild it if this browser lost it.
  const serverSession = active.data?.session
  useEffect(() => {
    if (!active.isSuccess) return
    setTimer((t) => {
      if (!serverSession) return null
      if (t && t.sessionId === serverSession.id) return t
      return timerFromSession(serverSession)
    })
  }, [active.isSuccess, serverSession])

  useEffect(() => saveTimer(timer), [timer])

  // Tick a few times a second while running.
  const running = timer?.endsAt != null
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [running])

  const finishSession = useCallback(
    (xp: number) => {
      setTimer(null)
      if (prefs.sound) chime()
      toast({ title: 'Session complete!', text: `+${xp} XP including the finish bonus`, icon: Timer, variant: 'achievement', kicker: 'Great focus' })
    },
    [prefs.sound, toast],
  )

  // Phase changes: report finished work blocks to the server, then move on.
  useEffect(() => {
    if (!timer || timer.endsAt === null || timer.endsAt > now || reporting.current) return
    if (timer.phase === 'break') {
      if (prefs.sound) chime()
      setTimer({ ...timer, phase: 'work', set: timer.set + 1, endsAt: timer.endsAt + timer.workMs })
      return
    }
    reporting.current = true
    reportSet(timer.sessionId, {
      onSuccess: ({ xp_change, finished }) => {
        setEarned((e) => e + xp_change)
        if (finished) return finishSession(xp_change)
        if (prefs.sound) chime()
        toast({ title: `+${xp_change} XP`, text: `Set ${timer.set + 1} done. Time for a break.`, icon: Coffee })
        setTimer({ ...timer, phase: 'break', endsAt: timer.endsAt! + timer.breakMs })
      },
      onError: (error) => {
        // A clock slightly ahead of the server: try again in a few seconds.
        if (error instanceof ApiError && error.status === 400) {
          setTimer({ ...timer, endsAt: Date.now() + 5000 })
        } else {
          toast({ title: "Couldn't save that set", text: 'Check your connection. Retrying…' })
          setTimer({ ...timer, endsAt: Date.now() + 10_000 })
        }
      },
      onSettled: () => {
        reporting.current = false
      },
    })
  }, [now, timer, reportSet, prefs.sound, toast, finishSession])

  // Tab title shows the countdown.
  useEffect(() => {
    const original = document.title
    if (timer) {
      document.title = `${formatClock(timeLeft(timer, now))} · ${timer.phase === 'work' ? 'Focus' : 'Break'} — StudyWebPlanner`
    }
    return () => {
      document.title = original
    }
  }, [timer, now])

  // Music plays only during focus time, if turned on.
  useEffect(() => {
    const el = audio.current
    if (!el) return
    if (prefs.music && running && timer?.phase === 'work') el.play().catch(() => {})
    else el.pause()
  }, [prefs.music, running, timer?.phase])

  const totalWork = prefs.work * prefs.sets
  const tooLong = totalWork > MAX_WORK_MINUTES
  const xp = previewXp(prefs.work, prefs.sets)

  function begin() {
    setEarned(0)
    start.mutate(
      { work_minutes: prefs.work, break_minutes: prefs.rest, planned_sets: prefs.sets },
      {
        onSuccess: (s) =>
          setTimer({ ...timerFromSession(s), endsAt: Date.now() + s.work_minutes * 60_000, pausedLeft: null }),
      },
    )
  }

  function pause() {
    if (timer?.endsAt != null) setTimer({ ...timer, pausedLeft: timeLeft(timer), endsAt: null })
  }

  function resume() {
    if (timer && timer.endsAt === null) setTimer({ ...timer, endsAt: Date.now() + (timer.pausedLeft ?? 0), pausedLeft: null })
  }

  function stopNow() {
    if (!timer) return
    stop.mutate(timer.sessionId, {
      onSuccess: () => {
        setConfirmStop(false)
        setTimer(null)
        toast({ title: 'Session stopped', text: earned > 0 ? `You kept the ${earned} XP you earned.` : undefined })
      },
    })
  }

  const left = timer ? timeLeft(timer, now) : prefs.work * 60_000
  const length = timer ? phaseLength(timer) : prefs.work * 60_000
  const fraction = length ? 1 - left / length : 0
  const phase = timer?.phase ?? 'work'
  const startError = start.error instanceof ApiError ? start.error : null

  return (
    <div className="pomodoro-page">
      <h1 className="page-title">Pomodoro</h1>
      <div className="pomodoro-layout">
        <section className={`card timer-card phase-${phase}${running ? ' is-running' : ''}`} aria-labelledby="timer-heading">
          <div className="timer-scene" aria-hidden="true">
            <span className="orb orb-1" /><span className="orb orb-2" /><span className="orb orb-3" />
          </div>
          <div className="phase-tabs" role="status" aria-live="polite">
            <span className={phase === 'work' ? 'active' : ''}>Focus</span>
            <span className={phase === 'break' ? 'active' : ''}>Break</span>
          </div>

          <div className="ring">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle className="ring-track" cx="60" cy="60" r="52" />
              <circle
                className="ring-fill"
                cx="60" cy="60" r="52"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - fraction}
              />
            </svg>
            <div className="ring-text">
              <h2 id="timer-heading" className="sr-only">Timer</h2>
              <span className="clock">{formatClock(left)}</span>
              <span className="muted">
                {timer ? `Set ${Math.min(timer.set + 1, timer.sets)} of ${timer.sets}` : `${prefs.sets} sets · ${formatMinutes(prefs.sets * (prefs.work + prefs.rest))}`}
              </span>
            </div>
          </div>

          <div className="timer-controls">
            {!timer && (
              <button className="btn btn-primary btn-lg" onClick={begin} disabled={start.isPending || tooLong}>
                <Play aria-hidden="true" /> {start.isPending ? 'Starting…' : 'Start'}
              </button>
            )}
            {timer && running && (
              <button className="btn btn-primary btn-lg" onClick={pause}><Pause aria-hidden="true" /> Pause</button>
            )}
            {timer && !running && (
              <button className="btn btn-primary btn-lg" onClick={resume}><Play aria-hidden="true" /> Resume</button>
            )}
            {timer && (
              <button className="btn btn-ghost btn-lg" onClick={() => setConfirmStop(true)}><Square aria-hidden="true" /> Stop</button>
            )}
          </div>
          {startError?.detail && <p className="form-error" role="alert">{startError.detail}</p>}
          {timer && earned > 0 && <p className="muted small">Earned this session: <strong>{earned} XP</strong></p>}
        </section>

        <section className="card panel pomodoro-settings" aria-labelledby="settings-heading">
          <h2 id="settings-heading">Settings</h2>
          <fieldset className="field" disabled={Boolean(timer)}>
            <legend>Focus time</legend>
            <MinutePicker value={prefs.work} presets={WORK_PRESETS} min={1} max={120} label="Focus minutes" onChange={(work) => updatePrefs({ work })} />
          </fieldset>
          <fieldset className="field" disabled={Boolean(timer)}>
            <legend>Break time</legend>
            <MinutePicker value={prefs.rest} presets={BREAK_PRESETS} min={1} max={60} label="Break minutes" onChange={(rest) => updatePrefs({ rest })} />
          </fieldset>
          <label className="field">
            <span>Sets</span>
            <input type="number" min={1} max={12} value={prefs.sets} disabled={Boolean(timer)}
              onChange={(e) => updatePrefs({ sets: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })} />
          </label>
          <p className={tooLong ? 'field-error' : 'muted small'}>
            {tooLong
              ? `That's ${formatMinutes(totalWork)} of focus. Keep a session to 6 hours or less.`
              : `${formatMinutes(totalWork)} of focus, ${formatMinutes(prefs.sets * (prefs.work + prefs.rest))} in total.`}
          </p>
          {!tooLong && (
            <p className="xp-preview">
              Earn <strong>+{xp.block} XP</strong> per set
              {xp.bonus > 0 && <> and <strong>+{xp.bonus} XP</strong> for finishing</>}: up to <strong>{xp.total} XP</strong>.
              Longer sessions earn more.
            </p>
          )}

          <div className="toggle-row">
            <button className="btn btn-ghost btn-sm" aria-pressed={prefs.sound} onClick={() => updatePrefs({ sound: !prefs.sound })}>
              {prefs.sound ? <Bell aria-hidden="true" /> : <BellOff aria-hidden="true" />} Chime {prefs.sound ? 'on' : 'off'}
            </button>
            {LOFI_TRACKS.length > 0 && (
              <button className="btn btn-ghost btn-sm" aria-pressed={prefs.music} onClick={() => updatePrefs({ music: !prefs.music })}>
                {prefs.music ? <Music aria-hidden="true" /> : <VolumeX aria-hidden="true" />} Lofi {prefs.music ? 'on' : 'muted'}
              </button>
            )}
          </div>
          {LOFI_TRACKS.length > 0 && (
            <>
              <audio ref={audio} src={LOFI_TRACKS[0].src} loop preload="none" />
              <p className="muted small">Music: {LOFI_TRACKS[0].credit}</p>
            </>
          )}
        </section>
      </div>

      {confirmStop && timer && (
        <ConfirmDialog
          title="Stop this session?"
          message={<p>You keep the XP from sets you've finished. The current set won't count.</p>}
          confirmLabel="Stop session"
          pending={stop.isPending}
          error={stop.isError ? "Couldn't stop the session." : undefined}
          onClose={() => setConfirmStop(false)}
          onConfirm={stopNow}
        />
      )}
    </div>
  )
}

function MinutePicker({
  value, presets, min, max, label, onChange,
}: {
  value: number
  presets: number[]
  min: number
  max: number
  label: string
  onChange: (v: number) => void
}) {
  return (
    <div className="minute-picker">
      {presets.map((p) => (
        <button key={p} type="button" className="preset" aria-pressed={value === p} onClick={() => onChange(p)}>
          {p} min
        </button>
      ))}
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
      />
    </div>
  )
}
