import axios from 'axios'
import { resolveHttpBaseUrl } from '@/api/apiOrigin'

/**
 * `/health` 与 `/` 挂在服务根路径，不在 OpenAPI 的 `/nexus/api/*` 下。
 * 故不用带 Nexus REST `baseURL` 的 `http` 实例，仅用同源 `origin` 直连。
 */
function nexusAppOrigin(): string {
  const base = resolveHttpBaseUrl()
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return new URL(base).origin
  }
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

/** GET /health — 原始 JSON，非 DataResponse 包装 */
export async function fetchHealth(): Promise<unknown> {
  const { data } = await axios.get<unknown>(`${nexusAppOrigin()}/health`, {
    timeout: 10_000,
    headers: { Accept: 'application/json' },
  })
  return data
}

/** GET / — 服务根信息 */
export async function fetchRoot(): Promise<unknown> {
  const { data } = await axios.get<unknown>(`${nexusAppOrigin()}/`, {
    timeout: 10_000,
    headers: { Accept: 'application/json' },
  })
  return data
}
