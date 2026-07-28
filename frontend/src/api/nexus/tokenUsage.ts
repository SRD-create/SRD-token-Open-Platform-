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

/** GET /token-usage */
export async function listTokenUsage(params?: {
  modelName?: string
  status?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
  userId?: number
}): Promise<{ items: unknown[]; total: number }> {
  const { data } = await http.get<unknown>('/token-usage', {
    params: {
      ...userParams({ userId: params?.userId }),
      model_name: params?.modelName,
      status: params?.status,
      start_date: params?.startDate,
      end_date: params?.endDate,
      limit: params?.limit,
      offset: params?.offset,
    },
  })
  return unpackListResponse(data)
}

/** GET /token-usage/summary */
export async function fetchTokenUsageSummary(params?: {
  days?: number
  userId?: number
}): Promise<unknown> {
  const { data } = await http.get<unknown>('/token-usage/summary', {
    params: {
      ...userParams({ userId: params?.userId }),
      days: params?.days,
    },
  })
  return unpackDataResponse(data)
}
