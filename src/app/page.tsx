import { redirect } from 'next/navigation'

import { getOptionalTenantContext } from '@/lib/auth/tenant-context'

export default async function RootPage() {
  const ctx = await getOptionalTenantContext()
  redirect(ctx ? '/command-center' : '/sign-in')
}
