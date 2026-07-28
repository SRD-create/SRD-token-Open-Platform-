import { safeRecord, safeString } from '@/lib/safe'

const TOKEN_KEYS = ['access_token', 'accessToken', 'token', 'jwt', 'bearerToken'] as const

function tokenFromRecord(o: Record<string, unknown> | null): string | null {
  if (!o) return null
  for (const k of TOKEN_KEYS) {
    const s = safeString(o[k]).trim()
    if (s) return s
  }
  return null
}

/**
 * 从登录/换票响应对象中取出访问令牌。
 * 兼容：`{ access_token }`、Nexus 包一层 `{ data: { access_token } }` 等。
 */
export function pickAccessToken(payload: unknown): string | null {
  const o = safeRecord(payload)
  const direct = tokenFromRecord(o)
  if (direct) return direct
  return tokenFromRecord(safeRecord(o?.data))
}

/** 换票接口若在 `data` 内一并返回 `user`，供登录态立即展示（字段名兼容嵌套） */
export function pickEmbeddedUserFromAuthPayload(payload: unknown): unknown {
  const o = safeRecord(payload)
  if (!o) return null
  const u = o.user
  if (u != null && typeof u === 'object' && !Array.isArray(u)) return u
  const inner = safeRecord(o.data)
  const u2 = inner?.user
  if (u2 != null && typeof u2 === 'object' && !Array.isArray(u2)) return u2
  return null
}
