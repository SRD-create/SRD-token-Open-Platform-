import { http } from '@/api/http'
import { optionalDevUserId } from '@/api/requestContext'
import { unpackDataResponse } from '@/api/response'
import type { CreatePaymentRequest } from '@/api/types/nexus'

type UserIdOpt = { userId?: number }

function userParams(extra?: UserIdOpt) {
  return {
    ...optionalDevUserId(),
    ...(extra?.userId != null ? { user_id: extra.userId } : {}),
  }
}

type WechatNativePaymentPayload = {
  order_id?: number
  amount?: number
  subject?: string
}

/**
 * POST /payments/wechat/native
 * 兼容两类后端实现：
 * - 旧：query `order_id`
 * - 新：body 直传创建参数（如 amount/subject）
 */
export async function createWechatNativePayment(
  payload?: WechatNativePaymentPayload,
  extra?: UserIdOpt,
): Promise<unknown> {
  const p = payload ?? {}
  const hasOrderId = p.order_id != null && Number.isFinite(Number(p.order_id))
  const { data } = await http.post<unknown>(
    '/payments/wechat/native',
    hasOrderId ? null : p,
    {
      params: { ...(hasOrderId ? { order_id: p.order_id } : {}), ...userParams(extra) },
    },
  )
  return unpackDataResponse(data)
}

/**
 * @deprecated OpenAPI 已改为 {@link createWechatNativePayment}；仍接受旧 `CreatePaymentRequest` 仅使用 `order_id`。
 */
export async function createPayment(
  body: CreatePaymentRequest,
  extra?: UserIdOpt,
): Promise<unknown> {
  return createWechatNativePayment({ order_id: body.order_id }, extra)
}

/** POST /payments/wechat/callback — 支付渠道回调（一般由服务端接收，前端按需代理或联调） */
export async function wechatPaymentCallback(body?: unknown): Promise<unknown> {
  const { data } = await http.post<unknown>('/payments/wechat/callback', body)
  return unpackDataResponse(data)
}
