const trimSlash = (s: string) => s.replace(/\/$/, '')

/** 浏览器侧 Nexus REST 前缀（与 OpenAPI、网关一致，均为 `/nexus/api/*`） */
export const NEXUS_API_BROWSER_PREFIX = '/nexus/api'

const DEFAULT_NEXUS_DOCS_URL = 'http://your-backend-ip:8001/docs'

/** Nexus 业务 API 的 OpenAPI / Swagger（`VITE_DOCS_URL`） */
export function resolveNexusOpenApiDocsUrl(): string {
  const v = import.meta.env.VITE_DOCS_URL?.trim()
  return trimSlash(v && v.length > 0 ? v : DEFAULT_NEXUS_DOCS_URL)
}

/**
 * 将历史配置 `/api` 规范为与后端一致的 `/nexus/api`（本项目 Nexus 接口均带此前缀）。
 */
function canonicalBrowserApiPath(raw: string): string {
  const t = raw.trim()
  if (!t) return NEXUS_API_BROWSER_PREFIX
  if (t.startsWith('http://') || t.startsWith('https://')) return t
  const p = t.startsWith('/') ? t : `/${t}`
  return p === '/api' ? NEXUS_API_BROWSER_PREFIX : p
}

/**
 * Nexus 主接口 axios `baseURL`：默认 **`/nexus/api`**（与 OpenAPI `/nexus/api/*` 一致）。
 * 生产 `base=/nexus/` 时：若 path 已以 `/nexus/` 开头则不再拼接，避免重复段。
 */
export function resolveHttpBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim() ?? ''
  const canonical = canonicalBrowserApiPath(raw)
  if (canonical.startsWith('http://') || canonical.startsWith('https://')) {
    return trimSlash(canonical)
  }
  const path = canonical.startsWith('/') ? canonical : `/${canonical}`
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '')
  if (!base || base === '/') return trimSlash(path)
  if (path === base || path.startsWith(`${base}/`)) return trimSlash(path)
  return trimSlash(`${base}${path}`)
}
