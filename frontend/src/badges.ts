import {
  Bird,
  BookOpen,
  CalendarHeart,
  CheckCheck,
  Crown,
  Flame,
  Footprints,
  Hand,
  Hourglass,
  ListPlus,
  Timer,
  Trophy,
  type LucideIcon,
} from 'lucide-react'

const BADGE_ICONS: Record<string, LucideIcon> = {
  'most-classes': BookOpen,
  'baby-steps': Footprints,
  trailblazer: Flame,
  ceo: Crown,
  phoenix: Bird,
  'more-more-more': ListPlus,
  'ultimate-task-taker': CheckCheck,
  'study-study-study': Timer,
  'bye-bye-byee': Hand,
  'time-traveler': Hourglass,
  'busy-bee': CalendarHeart,
}

export function badgeIcon(slug: string): LucideIcon {
  return BADGE_ICONS[slug] ?? Trophy
}
