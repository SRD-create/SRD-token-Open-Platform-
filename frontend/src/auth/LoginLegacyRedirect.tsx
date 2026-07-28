import { Navigate, useSearchParams } from 'react-router-dom'

/** 旧链接 /login、/login?from= 重定向到首页并拉起登录弹窗 */
export function LoginLegacyRedirect() {
  const [sp] = useSearchParams()
  const from = sp.get('from')
  if (from) {
    try {
      const decoded = decodeURIComponent(from)
      if (decoded.startsWith('/') && !decoded.startsWith('//')) {
        return <Navigate to={`/?login=1&from=${encodeURIComponent(decoded)}`} replace />
      }
    } catch {
      /* ignore */
    }
  }
  return <Navigate to="/?login=1" replace />
}
