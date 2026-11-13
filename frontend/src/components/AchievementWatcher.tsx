import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { api } from '../api'
import { useMe } from '../auth'
import { badgeIcon } from '../badges'
import { useToast } from '../toast'
import type { NewAchievement } from '../types'

/**
 * Pops up "Achievement unlocked" for new badges and "Level up!" when the
 * level goes up. Renders nothing itself.
 */
export default function AchievementWatcher() {
  const toast = useToast()
  const shown = useRef(new Set<string>())
  const { data: unseen } = useQuery({
    queryKey: ['achievements-unseen'],
    queryFn: () => api<NewAchievement[]>('/achievements/unseen/'),
  })

  useEffect(() => {
    const fresh = (unseen ?? []).filter((a) => !shown.current.has(a.slug))
    if (fresh.length === 0) return
    for (const a of fresh) {
      shown.current.add(a.slug)
      toast({ title: a.name, text: a.description, icon: badgeIcon(a.slug), variant: 'achievement' })
    }
    api('/achievements/seen/', 'POST', { slugs: fresh.map((a) => a.slug) }).catch(() => {
      // Not critical: worst case the popup shows again next visit.
    })
  }, [unseen, toast])

  const { data: me } = useMe()
  const lastLevel = useRef<number | null>(null)
  useEffect(() => {
    if (!me) return
    if (lastLevel.current !== null && me.level > lastLevel.current) {
      toast({ title: `Level up! You're level ${me.level}`, icon: Sparkles, variant: 'achievement' })
    }
    lastLevel.current = me.level
  }, [me, toast])

  return null
}
