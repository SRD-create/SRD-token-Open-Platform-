import { http } from '@/api/http'
import { unpackListResponse } from '@/api/response'

/** 将 `data: { levels | items | rows: [] }` 等形状规范为列表解析器可识别的 `data: []` */
function coerceToListResponseBody(data: unknown): unknown {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return data
  const top = data as Record<string, unknown>
  if (!('code' in top)) return data
  const inner = top.data
  if (Array.isArray(inner)) return data
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const bag = inner as Record<string, unknown>
    const arr = bag.items ?? bag.levels ?? bag.rows
    if (Array.isArray(arr)) return { ...top, data: arr }
  }
  return data
}

/** GET /agents/levels — 获取所有代理等级（OpenAPI「Get Agent Levels」） */
export async function listAgentLevels(): Promise<{ items: unknown[]; total: number }> {
  const { data } = await http.get<unknown>('/agents/levels')
  return unpackListResponse(coerceToListResponseBody(data))
}
