import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/useAuth'

/**
 * 需已登录且 `GET /user/me` 中 `is_admin === true`（映射为 {@link MePayload.isAdmin}）。
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { token, me, meLoading } = useAuth()
  const location = useLocation()
  const { t } = useTranslation()

  if (!token) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to={`/?login=1&from=${encodeURIComponent(from)}`} replace />
  }

  if (meLoading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4">
        <p className="text-sm text-zinc-500">{t('console.common.loading')}</p>
      </div>
    )
  }

  if (!me?.isAdmin) {
    return <Navigate to="/console/usage" replace />
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {children}
    </div>
  )
}
