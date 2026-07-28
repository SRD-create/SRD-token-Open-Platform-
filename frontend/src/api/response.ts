import { formatValidationDetail, NexusBizError } from '@/api/errors'
import type { DataResponse, HttpValidationError, ListResponse } from '@/api/types/nexus'

/** OpenAPI 默认成功码为 200；兼容部分网关返回 0 */
export function isNexusSuccessCode(code: number): boolean {
  return code === 200 || code === 0
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

/**
 * 解析 `DataResponse<T>` 的 axios 响应体（即 `response.data`）。
 * @throws NexusBizError
 */
export function unpackDataResponse<T = unknown>(raw: unknown): T {
  const r = raw as Partial<DataResponse<T>>
  if (r === null || typeof r !== 'object' || !('code' in r)) {
    throw new NexusBizError('接口返回格式异常', -1, raw)
  }
  if (!isNexusSuccessCode(Number(r.code))) {
    throw new NexusBizError(String(r.message ?? '请求失败'), Number(r.code), raw)
  }
  return r.data as T
}

/**
 * 解析 `ListResponse`：统一得到 `items` 与 `total`。
 * @throws NexusBizError
 */
export function unpackListResponse(raw: unknown): { items: unknown[]; total: number } {
  const r = raw as Partial<ListResponse<unknown>>
  if (r === null || typeof r !== 'object' || !('code' in r)) {
    throw new NexusBizError('接口返回格式异常', -1, raw)
  }
  if (!isNexusSuccessCode(Number(r.code))) {
    throw new NexusBizError(String(r.message ?? '请求失败'), Number(r.code), raw)
  }

  const d = r.data
  let items: unknown[] = []
  if (Array.isArray(d)) {
    items = d
  } else {
    const obj = asRecord(d)
    if (obj) {
      const listKeys = [
        'items',
        'list',
        'records',
        'rows',
        'models',
        'packages',
        'package',
        'data',
      ] as const
      for (const k of listKeys) {
        const v = obj[k]
        if (Array.isArray(v) && v.length > 0) {
          items = v
          break
        }
      }
      if (items.length === 0) {
        for (const k of listKeys) {
          const v = obj[k]
          if (Array.isArray(v)) {
            items = v
            break
          }
        }
      }
    }
  }

  const nest = asRecord(d)
  const nestedTotal =
    nest && typeof nest.total === 'number'
      ? nest.total
      : nest && typeof nest.count === 'number'
        ? nest.count
        : undefined
  const total = typeof r.total === 'number' ? r.total : nestedTotal ?? items.length
  return { items, total }
}

/** 从 FastAPI 422 或通用错误体提取可读文案 */
export function messageFromAxiosData(data: unknown): string | null {
  if (data === null || data === undefined) return null
  if (typeof data === 'string') return data
  const rec = asRecord(data)
  if (!rec) return null
  if (typeof rec.message === 'string') return rec.message
  const v = rec as HttpValidationError
  const formatted = formatValidationDetail(v.detail)
  if (formatted) return formatted
  return null
}
