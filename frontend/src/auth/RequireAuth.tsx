import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/auth/useAuth'

/**
 * 未登录访问受保护路由：回首页并拉起登录弹窗，且通过 `from` 记录原路径，便于微信 OAuth
 * 完成后跳回用户原本要去的控制台路由。
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const location = useLocation()

  if (!token) {
    const from = `${location.pathname}${location.search}`
    return (
      <Navigate
        to={`/?login=1&from=${encodeURIComponent(from)}`}
        replace
      />
    )
  }

  return children
}
