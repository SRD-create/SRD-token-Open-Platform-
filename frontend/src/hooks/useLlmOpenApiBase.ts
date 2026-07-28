import { useEffect, useMemo, useState } from 'react'
import { fetchLlmServerConfig, pickLlmOpenApiBaseUrl } from '@/api/nexus/config'

/**
 * 开发环境：将线上返回的 `https://…/llm/v1` 改为同源 `/llm/v1`，由 Vite 代理转发，避免浏览器 CORS。
 * 非 `/llm` 路径的绝对 URL 保持原样（自研网关需自行处理跨域或再配代理）。
 */
function devProxiedLlmBase(raw: string): string {
  if (!import.meta.env.DEV) return raw
  const t = raw.trim().replace(/\/$/, '')
  if (!/^https?:\/\//i.test(t)) return t.startsWith('/') ? t : `/${t}`
  try {
    const u = new URL(t)
    if (u.pathname === '/llm' || u.pathname.startsWith('/llm/')) {
      const p = (u.pathname + u.search).replace(/\/$/, '')
      return p || '/llm'
    }
  } catch {
    /* keep raw */
  }
  return raw
}

/**
 * OpenAI 兼容网关 base（如 `http://host:7000/v1`）。
 * 优先 `GET /config/llm-server` 返回的 `data.value`；失败时用 `VITE_LLM_OPENAPI_BASE` 或内置默认。
 */
export function useLlmOpenApiBase(): string {
  const fallback = useMemo(() => {
    const v = import.meta.env.VITE_LLM_OPENAPI_BASE?.trim()
    const raw = v || 'https://your-domain.com/llm/v1'
    return devProxiedLlmBase(raw)
  }, [])
  const [llmBase, setLlmBase] = useState(fallback)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const raw = await fetchLlmServerConfig()
        const picked = pickLlmOpenApiBaseUrl(raw)
        if (!cancelled && picked) setLlmBase(devProxiedLlmBase(picked))
      } catch {
        /* 未登录或接口不可用时保留回退 */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fallback])

  return llmBase
}
