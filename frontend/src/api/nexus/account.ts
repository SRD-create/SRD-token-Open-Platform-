import { http } from '@/api/http'
import { optionalDevUserId } from '@/api/requestContext'
import { unpackDataResponse, unpackListResponse } from '@/api/response'
import type { AgentRegisterRequest, TopUpRequest } from '@/api/types/nexus'

type UserIdOpt = { userId?: number }

function userParams(extra?: UserIdOpt) {
  return {
    ...optionalDevUserId(),
    ...(extra?.userId != null ? { user_id: extra.userId } : {}),
  }
}

/** GET /account/balance */
export async function fetchAccountBalance(extra?: UserIdOpt): Promise<unknown> {
  const { data } = await http.get<unknown>('/account/balance', { params: userParams(extra) })
  return unpackDataResponse(data)
}

/** GET /account/transactions */
export async function fetchAccountTransactions(params?: {
  accountType?: string
  transactionType?: string
  limit?: number
  offset?: number
  userId?: number
}): Promise<{ items: unknown[]; total: number }> {
  const { data } = await http.get<unknown>('/account/transactions', {
    params: {
      ...optionalDevUserId(),
      account_type: params?.accountType,
      transaction_type: params?.transactionType,
      limit: params?.limit,
      offset: params?.offset,
      ...(params?.userId != null ? { user_id: params.userId } : {}),
    },
  })
  return unpackListResponse(data)
}

/** POST /account/topup */
export async function topUpAccount(body: TopUpRequest, extra?: UserIdOpt): Promise<unknown> {
  const { data } = await http.post<unknown>('/account/topup', body, { params: userParams(extra) })
  return unpackDataResponse(data)
}

/** POST /account/agent/register — 代理加盟发起 Native 支付（返回体与 topup 对齐时可共用解析） */
export async function registerAgent(body: AgentRegisterRequest, extra?: UserIdOpt): Promise<unknown> {
  const { data } = await http.post<unknown>('/account/agent/register', body, {
    params: userParams(extra),
  })
  return unpackDataResponse(data)
}
