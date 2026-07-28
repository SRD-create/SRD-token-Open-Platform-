import { safeRecord } from '@/lib/safe'

export type AdminPagedParams = { pageNum: number; pageSize: number }

export type AdminPagedResult<T> = {
  rows: T[]
  total: number
  pages: number
  current: number
  size: number
}

function finiteInt(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  if (typeof v === 'string' && v.trim()) {
    const n = Number.parseInt(v.trim(), 10)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

/** 解析管理端常见分页 `data.{ records,total,pages,current,size }` */
export function parseAdminDataPage<T>(
  inner: unknown,
  requested: AdminPagedParams,
  mapRecord: (item: unknown) => T | null,
): AdminPagedResult<T> {
  if (Array.isArray(inner)) {
    const rows = inner.map(mapRecord).filter((r): r is T => r != null)
    return {
      rows,
      total: rows.length,
      pages: 1,
      current: 1,
      size: Math.max(1, requested.pageSize),
    }
  }

  const o = safeRecord(inner)
  if (!Object.keys(o).length) {
    return { rows: [], total: 0, pages: 1, current: 1, size: Math.max(1, requested.pageSize) }
  }

  const records = Array.isArray(o.records) ? o.records : []
  const total = Math.max(0, finiteInt(o.total, records.length))
  const size = Math.max(1, finiteInt(o.size, requested.pageSize))
  let current = Math.max(1, finiteInt(o.current, requested.pageNum))
  let pages = finiteInt(o.pages, 0)
  if (pages < 1) {
    pages = Math.max(1, Math.ceil(total / size) || 1)
  }
  current = Math.min(current, pages)

  const rows: T[] = []
  for (const it of records) {
    const row = mapRecord(it)
    if (row) rows.push(row)
  }
  return { rows, total, pages, current, size }
}

export type AdminEntityRow = Record<string, unknown> & { id: number }

/** 从记录中解析数值 id（兼容 `id` / `level_id` / `package_id` 等） */
export function pickAdminEntityId(o: Record<string, unknown>, idKeys: readonly string[]): number | null {
  for (const k of idKeys) {
    const v = o[k]
    if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
    if (typeof v === 'string' && v.trim()) {
      const n = Number.parseInt(v.trim(), 10)
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

export function asAdminEntityRow(item: unknown, idKeys: readonly string[]): AdminEntityRow | null {
  const o = safeRecord(item)
  if (!Object.keys(o).length) return null
  const id = pickAdminEntityId(o, idKeys)
  if (id == null) return null
  return { ...o, id } as AdminEntityRow
}
