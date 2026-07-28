import { http } from '@/api/http'
import { unpackDataResponse } from '@/api/response'
import { safeRecord } from '@/lib/safe'
import {
  asAdminEntityRow,
  parseAdminDataPage,
  type AdminEntityRow,
  type AdminPagedParams,
  type AdminPagedResult,
} from '@/api/nexus/adminPagedResource'

const SERVICES_PATH = '/models/services'
const PACKAGE_MODELS_PATH = '/models/package'

const SERVICE_ROW_ID_KEYS = ['id', 'service_id', 'serviceId'] as const

/** 套餐模型绑定弹窗单次拉全量列表（与常见 `/models/services?page=&pageSize=` 一致） */
export const MODEL_SERVICES_BINDING_PAGE_SIZE = 100

/**
 * GET /models/services — 查询参数与接口一致：`page`、`pageSize`。
 * 响应解析使用 `parseAdminDataPage`，与 `records/total/pages/current/size` 对齐。
 */
export async function listModelsServicesPage(
  params: AdminPagedParams,
): Promise<AdminPagedResult<AdminEntityRow>> {
  const pageNum = Math.max(1, Math.trunc(params.pageNum))
  const pageSize = Math.min(100, Math.max(1, Math.trunc(params.pageSize)))
  const { data } = await http.get<unknown>(SERVICES_PATH, {
    params: { page: pageNum, pageSize },
  })
  const inner = unpackDataResponse(data)
  return parseAdminDataPage(inner, { pageNum, pageSize }, (it) =>
    asAdminEntityRow(it, SERVICE_ROW_ID_KEYS),
  )
}

/** 模型绑定弹窗使用：第一页，`pageSize` 100，无前端分页 */
export function listModelsServicesForBindingModal(): Promise<AdminPagedResult<AdminEntityRow>> {
  return listModelsServicesPage({ pageNum: 1, pageSize: MODEL_SERVICES_BINDING_PAGE_SIZE })
}

/** GET /models/package/{package_id} — 原始 data，用于解析已绑定模型 */
export async function getPackageBoundModelsRaw(packageId: number): Promise<unknown> {
  const { data } = await http.get<unknown>(`${PACKAGE_MODELS_PATH}/${packageId}`)
  return unpackDataResponse(data)
}

/** POST /models/package/{package_id}/models — 绑定模型（body 与后端约定 `model_name`） */
export async function addPackageModelBinding(packageId: number, modelName: string): Promise<void> {
  const { data } = await http.post<unknown>(`${PACKAGE_MODELS_PATH}/${packageId}/models`, {
    model_name: modelName,
  })
  unpackDataResponse(data)
}

/**
 * 解除绑定：路径与 OpenAPI「Remove Package Model」一致
 * `/models/package/{package_id}/models/{model_name}`，网关侧要求使用 POST 而非 DELETE。
 */
export async function removePackageModelBinding(packageId: number, modelName: string): Promise<void> {
  const segment = encodeURIComponent(modelName)
  const { data } = await http.post<unknown>(`${PACKAGE_MODELS_PATH}/${packageId}/models/${segment}`, {})
  unpackDataResponse(data)
}

/** GET /models/services/{service_id} */
export async function getModelServiceById(serviceId: number): Promise<Record<string, unknown>> {
  const { data } = await http.get<unknown>(`${SERVICES_PATH}/${serviceId}`)
  const inner = unpackDataResponse(data)
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) {
    throw new Error('Invalid model service payload')
  }
  return inner as Record<string, unknown>
}

export type PackageModelBindingState = {
  /** 为 true 时表格行全部视为已绑定（优先级高于 models 列表） */
  isAllModels: boolean
  serviceIds: Set<number>
  names: Set<string>
}

function parseIsAllModelsFlag(o: Record<string, unknown>): boolean {
  const v = o.is_all_models ?? o.isAllModels ?? o.is_all_model
  if (v === true || v === 1 || v === '1' || v === 'true') return true
  return false
}

/** 将「套餐已绑定模型」接口的多种返回形状统一为用于行高亮的状态（含 is_all_models） */
export function extractBindingSetsFromPackageModelsPayload(data: unknown): PackageModelBindingState {
  const serviceIds = new Set<number>()
  const names = new Set<string>()

  const addId = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) serviceIds.add(Math.trunc(v))
    else if (typeof v === 'string' && /^\d+$/.test(v.trim())) {
      serviceIds.add(Number.parseInt(v.trim(), 10))
    }
  }
  const addName = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) names.add(v.trim())
  }

  const visit = (item: unknown) => {
    if (typeof item === 'string') {
      addName(item)
      return
    }
    if (typeof item === 'number' && Number.isFinite(item)) {
      addId(item)
      return
    }
    const o = safeRecord(item)
    if (!Object.keys(o).length) return
    for (const k of ['service_id', 'serviceId', 'id'] as const) addId(o[k])
    for (const k of ['model_name', 'modelName', 'name'] as const) addName(o[k])
  }

  if (Array.isArray(data)) {
    for (const it of data) visit(it)
    return { isAllModels: false, serviceIds, names }
  }

  const o = safeRecord(data)
  const isAllModels = Object.keys(o).length > 0 ? parseIsAllModelsFlag(o) : false

  for (const k of ['models', 'records', 'items', 'list', 'data'] as const) {
    const arr = o[k]
    if (Array.isArray(arr)) {
      for (const it of arr) visit(it)
    }
  }

  return { isAllModels, serviceIds, names }
}

/** 与 DELETE 路径 `{model_name}` 一致：优先接口展示列 `name` */
export function pickModelNameForBindingApi(row: Record<string, unknown>): string | null {
  for (const k of ['name', 'model_name', 'modelName'] as const) {
    const v = row[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}
