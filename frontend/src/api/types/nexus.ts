/**
 * Types aligned with OpenAPI 3.1 — AI Token 平台 API
 * Source: {baseURL}/openapi.json
 */

/** 通用「单资源」响应 */
export type DataResponse<T = unknown> = {
  code: number
  message: string
  data: T | null
}

/** 通用「列表」响应（data 可为数组或分页对象，以服务端为准） */
export type ListResponse<T = unknown> = {
  code: number
  message: string
  data: T[] | Record<string, unknown> | null
  total: number
}

export type UserUpdate = {
  name: string
  email: string
}

export type TopUpRequest = {
  amount: number
  payment_method: string
}

/** POST /account/agent/register — OpenAPI：代理商加盟 */
export type AgentRegisterRequest = {
  agent_level_id: number
  payment_method: string
}

export type CreateApiKeyRequest = {
  name: string
  /** 与目录套餐 `id` 一致：「套餐」Tab 为当前卡片 id；「计量」Tab 为按量套餐固定 id（见 `ApiKeysPage`） */
  package_id?: number
}

export type UpdateApiKeyStatusRequest = {
  status: string
}

export type PurchasePackageRequest = {
  payment_method: string
  /** 与路径 `/packages/{package_id}/purchase` 及套餐列表 `id` 一致 */
  package_id: number
}

export type CreatePaymentRequest = {
  order_id: number
  payment_method: string
}

export type WithdrawalRequest = {
  amount: number
  /** 后端可能要求字段存在；未绑卡时传空串 */
  bank_account?: string
}

export type HttpValidationError = {
  detail?: Array<{
    loc?: (string | number)[]
    msg?: string
    type?: string
  }>
}
