import { http } from '@/api/http'
import { unpackDataResponse } from '@/api/response'
import {
  asAdminEntityRow,
  parseAdminDataPage,
  type AdminEntityRow,
  type AdminPagedParams,
  type AdminPagedResult,
} from '@/api/nexus/adminPagedResource'

const PREFIX = '/admin/packages'
const ID_KEYS = ['id', 'package_id', 'packageId'] as const

export async function listAdminPackagesAdmin(params: AdminPagedParams): Promise<AdminPagedResult<AdminEntityRow>> {
  const pageNum = Math.max(1, Math.trunc(params.pageNum))
  const pageSize = Math.min(100, Math.max(1, Math.trunc(params.pageSize)))
  const { data } = await http.get<unknown>(PREFIX, { params: { pageNum, pageSize } })
  const inner = unpackDataResponse(data)
  return parseAdminDataPage(inner, { pageNum, pageSize }, (it) => asAdminEntityRow(it, ID_KEYS))
}

export async function getAdminPackageAdmin(id: number): Promise<AdminEntityRow> {
  const { data } = await http.get<unknown>(`${PREFIX}/${id}`)
  const inner = unpackDataResponse(data)
  const row = asAdminEntityRow(inner, ID_KEYS)
  if (!row) throw new Error('Invalid package payload')
  return row
}

export async function createAdminPackageAdmin(body: Record<string, unknown>): Promise<void> {
  const { data } = await http.post<unknown>(PREFIX, body)
  unpackDataResponse(data)
}

export async function updateAdminPackageAdmin(id: number, body: Record<string, unknown>): Promise<void> {
  const { data } = await http.post<unknown>(`${PREFIX}/${id}`, body)
  unpackDataResponse(data)
}

export async function deleteAdminPackageAdmin(id: number): Promise<void> {
  const { data } = await http.post<unknown>(`${PREFIX}/${id}/delete`, {})
  unpackDataResponse(data)
}
