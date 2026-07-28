import { http } from '@/api/http'
import { unpackDataResponse } from '@/api/response'
import { safeRecord, safeString } from '@/lib/safe'

/** 从 `GET /config/llm-server` 的 `data` 中解析 OpenAI 兼容网关 base（线上多为 `{ key, value, ... }` 的 `value`） */
export function pickLlmOpenApiBaseUrl(data: unknown): string | null {
  const r = safeRecord(data)
  const fromKv = safeString(r.value).trim()
  if (fromKv) return fromKv.replace(/\/$/, '')

  const raw =
    r.base_url ??
    r.baseUrl ??
    r.url ??
    r.openapi_base ??
    r.llm_server_url ??
    r.endpoint ??
    r.api_base ??
    r.apiBase
  const v = safeString(raw).trim()
  if (!v) return null
  return v.replace(/\/$/, '')
}

/** GET /config/llm-server — 获取 LLM 网关/OpenAI 兼容 base 等配置 */
export async function fetchLlmServerConfig(): Promise<unknown> {
  const { data } = await http.get<unknown>('/config/llm-server')
  return unpackDataResponse(data)
}
