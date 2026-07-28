import { http } from '@/api/http'
import { unpackDataResponse } from '@/api/response'
import {
  asAdminEntityRow,
  parseAdminDataPage,
  type AdminEntityRow,
  type AdminPagedParams,
  type AdminPagedResult,
} from '@/api/nexus/adminPagedResource'

const PREFIX = '/admin/agent-levels'
const ID_KEYS = ['id', 'level_id', 'levelId'] as const

export async function listAdminAgentLevels(params: AdminPagedParams): Promise<AdminPagedResult<AdminEntityRow>> {
  const pageNum = Math.max(1, Math.trunc(params.pageNum))
  const pageSize = Math.min(100, Math.max(1, Math.trunc(params.pageSize)))
  const { data } = await http.get<unknown>(PREFIX, { params: { pageNum, pageSize } })
  const inner = unpackDataResponse(data)
  return parseAdminDataPage(inner, { pageNum, pageSize }, (it) => asAdminEntityRow(it, ID_KEYS))
}

export async function getAdminAgentLevel(id: number): Promise<AdminEntityRow> {
  const { data } = await http.get<unknown>(`${PREFIX}/${id}`)
  const inner = unpackDataResponse(data)
  const row = asAdminEntityRow(inner, ID_KEYS)
  if (!row) throw new Error('Invalid agent level payload')
  return row
}

export async function createAdminAgentLevel(body: Record<string, unknown>): Promise<void> {
  const { data } = await http.post<unknown>(PREFIX, body)
  unpackDataResponse(data)
}

export async function updateAdminAgentLevel(id: number, body: Record<string, unknown>): Promise<void> {
  const { data } = await http.post<unknown>(`${PREFIX}/${id}`, body)
  unpackDataResponse(data)
}

export async function deleteAdminAgentLevel(id: number): Promise<void> {
  const { data } = await http.post<unknown>(`${PREFIX}/${id}/delete`, {})
  unpackDataResponse(data)
}
