import { createContext, useContext } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface Toast {
  id: number
  title: string
  text?: string
  icon?: LucideIcon
  /** "achievement" gets the bigger unlocked-badge style. */
  variant?: 'info' | 'achievement'
  /** Small heading above the title; achievements default to "Achievement unlocked". */
  kicker?: string
}

export const ToastContext = createContext<(toast: Omit<Toast, 'id'>) => void>(() => {})

/** Show a small popup in the corner: `toast({ title: '+5 XP' })`. */
export function useToast() {
  return useContext(ToastContext)
}
