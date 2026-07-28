/** 业务层返回的 code ≠ 成功值 */
export class NexusBizError extends Error {
  readonly code: number
  readonly payload: unknown

  constructor(message: string, code: number, payload?: unknown) {
    super(message)
    this.name = 'NexusBizError'
    this.code = code
    this.payload = payload
  }
}

/**
 * FastAPI 422：`detail` 为校验错误对象数组。
 * 404 等：`detail` 常为字符串（如 `"Not Found"`），不能对字符串调用 `.map`。
 */
export function formatValidationDetail(detail: unknown): string | null {
  if (detail == null) return null
  if (typeof detail === 'string') {
    const s = detail.trim()
    return s || null
  }
  if (!Array.isArray(detail) || detail.length === 0) return null
  return detail
    .map((d) => {
      if (d == null || typeof d !== 'object') return ''
      const rec = d as { loc?: unknown; msg?: unknown }
      const loc = Array.isArray(rec.loc) ? rec.loc.filter(Boolean).join('.') : ''
      const msg = typeof rec.msg === 'string' ? rec.msg : ''
      return loc ? `${loc}: ${msg}` : msg
    })
    .filter(Boolean)
    .join('; ')
}
