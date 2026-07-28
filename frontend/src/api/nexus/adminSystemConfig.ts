import { NexusBizError } from '@/api/errors'
import { http } from '@/api/http'
import { unpackDataResponse } from '@/api/response'
import { safeRecord } from '@/lib/safe'

/** 管理端「系统配置」列表行（与 `records` 项对齐；`id` 仅用于编辑与 React key，不在表格展示） */
export type SystemPlanConfigRow = {
  id: number
  configKey: string
  configValue: string
  description: string
  category: string
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

/** `GET /config/system` 分页块（与后端 `data.total|pages|current|size|records` 对齐） */
export type SystemPlanConfigPage = {
  rows: SystemPlanConfigRow[]
  total: number
  pages: number
  current: number
  size: number
}

export type ListSystemPlanConfigsParams = {
  /** 页码，从 1 开始（查询参数 `pageNum`） */
  pageNum: number
  /** 每页条数（查询参数 `pageSize`） */
  pageSize: number
}

function pickNumericId(o: Record<string, unknown>): number | null {
  const candidates = [o.id, o.config_id, o.configId]
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.trunc(v)
    if (typeof v === 'string' && v.trim()) {
      const n = Number.parseInt(v.trim(), 10)
      if (Number.isFinite(n) && n >= 0) return n
    }
  }
  return null
}

function pickStr(o: Record<string, unknown>, keys: readonly string[], fallback = '—'): string {
  for (const k of keys) {
    const v = o[k]
    if (v == null) continue
    const s = typeof v === 'string' ? v.trim() : String(v).trim()
    if (s) return s
  }
  return fallback
}

function pickBool(v: unknown): boolean {
  if (v === true || v === 1 || v === '1' || v === 'true') return true
  if (v === false || v === 0 || v === '0' || v === 'false') return false
  return false
}

function pickIsoTime(o: Record<string, unknown>, snake: string, camel: string): string {
  const v = o[snake] ?? o[camel]
  if (v == null) return '—'
  const s = typeof v === 'string' ? v.trim() : String(v)
  return s || '—'
}

function parseSystemPlanConfigRow(item: unknown): SystemPlanConfigRow | null {
  const o = safeRecord(item)
  if (!o) return null
  const id = pickNumericId(o)
  if (id == null) return null
  return {
    id,
    configKey: pickStr(o, ['config_key', 'configKey'], '—'),
    configValue: pickStr(o, ['config_value', 'configValue'], '—'),
    description: pickStr(o, ['description', 'desc', 'name', 'title'], '—'),
    category: pickStr(o, ['category', 'type', 'config_category', 'configCategory'], '—'),
    isDeleted: pickBool(o.is_deleted ?? o.isDeleted),
    createdAt: pickIsoTime(o, 'created_at', 'createdAt'),
    updatedAt: pickIsoTime(o, 'updated_at', 'updatedAt'),
  }
}

function finiteInt(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  if (typeof v === 'string' && v.trim()) {
    const n = Number.parseInt(v.trim(), 10)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

/** 解析分页 `data`（含 `records`）或非分页数组 */
function parseSystemPlanConfigPage(inner: unknown, requested: ListSystemPlanConfigsParams): SystemPlanConfigPage {
  if (Array.isArray(inner)) {
    const rows = inner.map(parseSystemPlanConfigRow).filter((r): r is SystemPlanConfigRow => r != null)
    const size = Math.max(1, requested.pageSize)
    return {
      rows,
      total: rows.length,
      pages: 1,
      current: 1,
      size,
    }
  }

  const o = safeRecord(inner)
  if (!o) {
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

  const rows: SystemPlanConfigRow[] = []
  for (const it of records) {
    const row = parseSystemPlanConfigRow(it)
    if (row) rows.push(row)
  }

  return { rows, total, pages, current, size }
}

/** GET /config/system?pageNum=&pageSize= — 系统配置分页列表 */
export async function listSystemPlanConfigs(params: ListSystemPlanConfigsParams): Promise<SystemPlanConfigPage> {
  const pageNum = Math.max(1, Math.trunc(params.pageNum))
  const pageSize = Math.min(100, Math.max(1, Math.trunc(params.pageSize)))
  const { data } = await http.get<unknown>('/config/system', {
    params: { pageNum, pageSize },
  })
  const inner = unpackDataResponse(data)
  return parseSystemPlanConfigPage(inner, { pageNum, pageSize })
}

/** GET /config/system/{config_id} — 单条系统配置详情 */
export async function getSystemPlanConfig(configId: number): Promise<SystemPlanConfigRow> {
  const { data } = await http.get<unknown>(`/config/system/${configId}`)
  const inner = unpackDataResponse(data)
  const row = parseSystemPlanConfigRow(inner)
  if (!row) {
    throw new NexusBizError('接口返回数据异常', 200, inner)
  }
  return row
}

/** POST /config/system — 新增系统配置 */
export type CreateSystemPlanConfigPayload = {
  configKey: string
  configValue: string
  description: string
  category: string
  isDeleted?: boolean
}

export async function createSystemPlanConfig(payload: CreateSystemPlanConfigPayload): Promise<void> {
  const { data } = await http.post<unknown>('/config/system', {
    config_key: payload.configKey.trim(),
    config_value: payload.configValue.trim(),
    description: payload.description.trim(),
    category: payload.category.trim(),
    is_deleted: payload.isDeleted ?? false,
  })
  unpackDataResponse(data)
}

/** POST /config/system/{config_id} — 更新系统配置（请求体与详情字段对齐） */
export type UpdateSystemPlanConfigPayload = {
  id: number
  configKey: string
  configValue: string
  description: string
  category: string
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

export async function updateSystemPlanConfig(
  configId: number,
  payload: UpdateSystemPlanConfigPayload,
): Promise<void> {
  const { data } = await http.post<unknown>(`/config/system/${configId}`, {
    id: payload.id,
    config_key: payload.configKey.trim(),
    config_value: payload.configValue.trim(),
    description: payload.description.trim(),
    category: payload.category.trim(),
    is_deleted: payload.isDeleted,
    created_at: payload.createdAt.trim(),
    updated_at: payload.updatedAt.trim(),
  })
  unpackDataResponse(data)
}

/** POST /config/system/{config_id}/delete — 删除系统配置 */
export async function deleteSystemPlanConfig(configId: number): Promise<void> {
  const { data } = await http.post<unknown>(`/config/system/${configId}/delete`, {})
  unpackDataResponse(data)
}
