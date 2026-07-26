import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CloudSun,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  Ship,
  ShieldAlert,
  Siren,
  Wrench,
} from 'lucide-react'

import type { Permission } from '@/lib/auth/permissions'

/**
 * The navigation is also the roadmap.
 *
 * Modules that do not exist yet are listed as disabled with the phase that
 * delivers them, rather than linking to an empty page. A dead link that renders
 * a blank screen is worse than an honest "Phase 4" label — and it would also
 * fail the build, since typed routes only accept routes that exist.
 */
export type NavItem = {
  label: string
  icon: LucideIcon
  permission: Permission
  question: string
} & ({ href: '/command-center' | '/fleet' | '/operations' | '/weather' } | { phase: number })

export const NAVIGATION: NavItem[] = [
  {
    label: 'Command Center',
    icon: LayoutDashboard,
    permission: 'dashboard:read',
    question: 'What needs my attention?',
    href: '/command-center',
  },
  {
    label: 'Fleet',
    icon: Ship,
    permission: 'fleet:read',
    question: 'What is happening with my fleet?',
    href: '/fleet',
  },
  {
    label: 'Operations',
    icon: Activity,
    permission: 'operation:read',
    question: 'What is happening with my operations?',
    href: '/operations',
  },
  {
    label: 'Weather',
    icon: CloudSun,
    permission: 'weather:read',
    question: 'Does the environment allow us to continue?',
    href: '/weather',
  },
  {
    label: 'Risk',
    icon: ShieldAlert,
    permission: 'risk:read',
    question: 'What could go wrong?',
    phase: 5,
  },
  {
    label: 'Alerts',
    icon: Siren,
    permission: 'alert:read',
    question: 'What requires action?',
    phase: 5,
  },
  {
    label: 'Assets',
    icon: Wrench,
    permission: 'asset:read',
    question: 'Which equipment is causing problems?',
    phase: 6,
  },
  {
    label: 'Incidents',
    icon: AlertTriangle,
    permission: 'incident:read',
    question: 'What happened, and why does it keep happening?',
    phase: 7,
  },
  {
    label: 'Analytics',
    icon: BarChart3,
    permission: 'analytics:read',
    question: 'What do the numbers say over time?',
    phase: 8,
  },
  {
    label: 'Ocean AI',
    icon: Bot,
    permission: 'ai:query',
    question: 'Explain the picture to me.',
    phase: 9,
  },
  {
    label: 'Administration',
    icon: Settings,
    permission: 'user:manage',
    question: 'Who has access, and to what?',
    phase: 2,
  },
]
