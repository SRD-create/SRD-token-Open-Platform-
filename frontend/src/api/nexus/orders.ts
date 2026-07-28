import { http } from '@/api/http'
import { optionalDevUserId } from '@/api/requestContext'
import { unpackDataResponse, unpackListResponse } from '@/api/response'

type UserIdOpt = { userId?: number }

function userParams(extra?: UserIdOpt) {
  return {
    ...optionalDevUserId(),
    ...(extra?.userId != null ? { user_id: extra.userId } : {}),
  }
}

/** GET /orders */
export async function listOrders(params?: {
  orderType?: string
  status?: string
  limit?: number
  offset?: number
  userId?: number
}): Promise<{ items: unknown[]; total: number }> {
  const { data } = await http.get<unknown>('/orders', {
    params: {
      ...userParams({ userId: params?.userId }),
      order_type: params?.orderType,
      status: params?.status,
      limit: params?.limit,
      offset: params?.offset,
    },
  })
  return unpackListResponse(data)
}

/** GET /orders/{order_id} */
export async function getOrder(orderId: number, extra?: UserIdOpt): Promise<unknown> {
  const { data } = await http.get<unknown>(`/orders/${orderId}`, { params: userParams(extra) })
  return unpackDataResponse(data)
}
