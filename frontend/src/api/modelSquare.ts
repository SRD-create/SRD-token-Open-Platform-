import { http } from '@/api/http'
import { unpackDataResponse } from '@/api/response'

export type ModelSquareOption = { value: string; label: string }

export type ModelServiceRecord = {
  name: string
  provider: string
  provider_label: string
  description: string
  max_context_length: number
  model_type: string
  model_type_label: string
  parameters: string
  status: string
  input_token_price?: number
  output_token_price?: number
  /** 分档计价：常见为 `context_range_*` + `input_token_price` / `output_token_price`（元 / token） */
  prices?: unknown
  /** 部分接口用 `price` 承载与 `prices` 相同的数组 */
  price?: unknown
}

export type ModelServicesListPayload = {
  total: number
  pages: number
  current: number
  size: number
  records: ModelServiceRecord[]
}

/** GET /model-services/types/list */
export async function fetchModelServiceTypes(): Promise<ModelSquareOption[]> {
  const { data } = await http.get<unknown>('/model-services/types/list')
  return unpackDataResponse(data) as ModelSquareOption[]
}

/** GET /model-services/providers/list */
export async function fetchModelServiceProviders(): Promise<ModelSquareOption[]> {
  const { data } = await http.get<unknown>('/model-services/providers/list')
  return unpackDataResponse(data) as ModelSquareOption[]
}

/** GET /model-services?pageNum=&pageSize=&model_type=&provider= */
export async function fetchModelServicesPage(params: {
  pageNum: number
  pageSize: number
  modelType?: string
  provider?: string
}): Promise<ModelServicesListPayload> {
  const { data } = await http.get<unknown>('/model-services', {
    params: {
      pageNum: params.pageNum,
      pageSize: params.pageSize,
      ...(params.modelType ? { model_type: params.modelType } : {}),
      ...(params.provider ? { provider: params.provider } : {}),
    },
  })
  return unpackDataResponse(data) as ModelServicesListPayload
}
