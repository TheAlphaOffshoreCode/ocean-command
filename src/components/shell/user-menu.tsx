'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, LogOut } from 'lucide-react'

import { signOut } from '@/features/auth/actions/sign-out'

const ROLE_LABELS: Record<string, string> = {
  ADMINISTRATOR: 'Administrator',
  OPERATIONS_MANAGER: 'Operations Manager',
  OPERATOR: 'Operator',
  VIEWER: 'Viewer',
}

export function UserMenu({
  name,
  email,
  role,
  organization,
}: {
  name: string
  email: string
  role: string
  organization: string
}) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="hover:bg-surface-overlay flex items-center gap-2 rounded px-2 py-1.5 transition-colors">
        <span className="bg-accent-soft text-accent grid size-7 place-items-center rounded-full text-xs font-semibold">
          {initials}
        </span>
        <span className="hidden text-left sm:block">
          <span className="text-ink block text-xs font-medium">{name}</span>
          <span className="text-ink-faint block text-[11px]">{ROLE_LABELS[role] ?? role}</span>
        </span>
        <ChevronDown className="text-ink-faint size-3.5" aria-hidden />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="border-line bg-surface-overlay z-50 w-60 rounded border p-1 shadow-xl"
        >
          <div className="px-2 py-2">
            <p className="text-ink truncate text-xs font-medium">{email}</p>
            <p className="text-ink-faint mt-0.5 truncate text-[11px]">{organization}</p>
          </div>

          <DropdownMenu.Separator className="bg-line my-1 h-px" />

          {/* A form, not an onClick: sign-out is a mutation, and it must work
              even if the client bundle never hydrates. */}
          <form action={signOut}>
            <button
              type="submit"
              className="text-ink-muted hover:bg-surface-hover hover:text-ink flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors"
            >
              <LogOut className="size-3.5" aria-hidden />
              Sign out
            </button>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
