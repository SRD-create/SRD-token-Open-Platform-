import { safeRecord, safeString } from '@/lib/safe'

/** 完整 `sk-…` 在表格中改为「前缀 + 少量 * + 尾缀」，避免中间过长占位 */
export function maskApiKeyForTableDisplay(secret: string): string {
  const s = secret.trim()
  if (!s || s === '—') return s
  if (s.includes('…') || s.toLowerCase().includes('...')) return s
  if (!/^sk-/i.test(s) || s.length < 20) return s
  const headLen = 7
  const tailLen = 4
  if (s.length <= headLen + tailLen + 4) return s
  const starCount = 5
  return `${s.slice(0, headLen)}${'*'.repeat(starCount)}${s.slice(-tailLen)}`
}

export type ApiKeyTableRow = {
  id: string
  name: string
  /** 列表展示：接口掩码或完整 key，不做中间截断 */
  displayKey: string
  /** 点击复制：能解析出完整明文则复制明文，否则复制展示串 */
  copyKey: string
  createdAt: string
  /** 关联目录套餐 id；无则 null（与 GET /packages 中套餐 `id` 一致） */
  packageId: number | null
  /** GET /api-keys 的 `package_type`；`common` 对应「计量」列表，其余按 `packageId` 绑定「套餐」卡片 */
  packageType: string | null
}

function pickDisplayKey(r: Record<string, unknown>): string {
  const full =
    safeString(r.api_key) ||
    safeString(r.key) ||
    safeString(r.secret) ||
    safeString(r.token) ||
    safeString(r.plain_key)
  const fullTrim = full.trim()
  if (
    fullTrim &&
    !fullTrim.includes('…') &&
    !fullTrim.toLowerCase().includes('...') &&
    /^sk-/i.test(fullTrim) &&
    fullTrim.length >= 20
  ) {
    return fullTrim
  }
  const direct =
    safeString(r.masked_key) ||
    safeString(r.maskedKey) ||
    safeString(r.key_preview) ||
    safeString(r.prefix)
  if (direct) return direct
  if (fullTrim) return fullTrim
  return '—'
}

function pickPackageIdForApiKeyRow(r: Record<string, unknown>): number | null {
  const raw = r.package_id ?? r.packageId
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.trunc(n)
}

function pickPackageTypeForApiKeyRow(r: Record<string, unknown>): string | null {
  const raw = safeString(r.package_type ?? r.packageType).trim()
  return raw || null
}

function pickCreated(r: Record<string, unknown>): string {
  const raw =
    safeString(r.created_at) ||
    safeString(r.createdAt) ||
    safeString(r.created) ||
    safeString(r.inserted_at)
  if (!raw) return '—'
  const d = Date.parse(raw)
  if (Number.isNaN(d)) return raw
  return new Date(d).toLocaleString()
}

/**
 * 列表接口若返回完整 `sk-…` 密钥（部分环境 `key` 字段即明文），用于下拉选择后作为 Bearer；
 * 仅 `masked_key` 等无法还原时返回 null。
 */
export function pickApiKeyListItemSecret(item: unknown): string | null {
  const r = safeRecord(item)
  const candidates = [
    safeString(r.api_key),
    safeString(r.secret),
    safeString(r.token),
    safeString(r.plain_key),
    safeString(r.key),
  ]
  for (const raw of candidates) {
    const s = raw.trim()
    if (!s) continue
    if (s.includes('…') || s.toLowerCase().includes('...')) continue
    if (/^sk-/i.test(s) && s.length >= 20) return s
  }
  return null
}

/** `GET /api-keys/models` 返回列表：提取下拉用的模型 id（保序去重） */
export function pickModelNamesFromApiKeyModelsList(items: unknown[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const it of items) {
    let id: string | null = null
    if (typeof it === 'string') {
      const s = it.trim()
      id = s || null
    } else {
      const r = safeRecord(it)
      const raw = safeString(r.name ?? r.model ?? r.model_name ?? r.modelName ?? r.id).trim()
      id = raw || null
    }
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function mapApiKeyItemToRow(item: unknown, localeTag: string): ApiKeyTableRow | null {
  const r = safeRecord(item)
  const id = safeString(r.id ?? r.api_key_id ?? r.key_id)
  const name = safeString(r.name ?? r.label ?? r.title)
  if (!id && !name) return null
  const display = pickDisplayKey(r)
  const secret = pickApiKeyListItemSecret(item)
  return {
    id: id || `row-${name}`,
    name: name || '—',
    displayKey: display,
    copyKey: secret ?? display,
    createdAt: pickCreated(r) || new Date().toLocaleDateString(localeTag),
    packageId: pickPackageIdForApiKeyRow(r),
    packageType: pickPackageTypeForApiKeyRow(r),
  }
}

/** 创建密钥接口返回里取出「仅展示一次」的完整 secret */
export function pickCreatedApiKeySecret(data: unknown): string | null {
  const r = safeRecord(data)
  const full =
    safeString(r.api_key) ||
    safeString(r.key) ||
    safeString(r.secret) ||
    safeString(r.token) ||
    safeString(r.plain_key)
  return full.trim() || null
}
