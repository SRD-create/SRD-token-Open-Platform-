import { NexusBizError } from '@/api/errors'
import { http } from '@/api/http'
import { optionalDevUserId } from '@/api/requestContext'
import { isNexusSuccessCode, unpackDataResponse, unpackListResponse } from '@/api/response'
import type { WithdrawalRequest } from '@/api/types/nexus'
import { safeRecord, safeString } from '@/lib/safe'

type UserIdOpt = { userId?: number }

function userParams(extra?: UserIdOpt) {
  return {
    ...optionalDevUserId(),
    ...(extra?.userId != null ? { user_id: extra.userId } : {}),
  }
}

/** 后端在 code=200 时仍可能通过 message 要求先绑定微信服务号，并返回 `data.auth_url` */
export const WECHAT_SERVICE_BIND_MESSAGE = '请先绑定微信服务号' as const

export type WechatServiceBindErrorPayload = {
  readonly wechatServiceBind: true
  readonly authUrl: string
}

export function extractWechatServiceBindAuthUrl(error: unknown): string | null {
  if (!(error instanceof NexusBizError)) return null
  if (!isNexusSuccessCode(error.code)) return null
  const p = safeRecord(error.payload)
  if (p?.wechatServiceBind !== true) return null
  const url = safeString(p.authUrl).trim()
  return /^https?:\/\//i.test(url) ? url : null
}

function messageRequiresWechatServiceBind(message: string): boolean {
  const m = message.trim()
  if (m === WECHAT_SERVICE_BIND_MESSAGE) return true
  return m.includes('绑定微信服务号')
}

/** POST /withdrawals/wechat — 创建提现并发起微信转账（用户确认模式需配合 `package_info` 等） */
export async function createWechatWithdrawal(
  body: WithdrawalRequest,
  extra?: UserIdOpt,
): Promise<unknown> {
  const { data: raw } = await http.post<unknown>('/withdrawals/wechat', body, {
    params: userParams(extra),
  })
  const envelope = raw as Partial<{ code: unknown; message: unknown; data: unknown }>
  if (envelope == null || typeof envelope !== 'object' || !('code' in envelope)) {
    throw new NexusBizError('接口返回格式异常', -1, raw)
  }
  const codeNum = Number(envelope.code)
  if (!isNexusSuccessCode(codeNum)) {
    throw new NexusBizError(String(envelope.message ?? '请求失败'), codeNum, raw)
  }
  const msg = String(envelope.message ?? '').trim()
  if (messageRequiresWechatServiceBind(msg)) {
    const d = safeRecord(envelope.data)
    const authUrl = safeString(d?.auth_url ?? d?.authUrl).trim()
    if (authUrl.length > 0) {
      throw new NexusBizError(msg, codeNum || 200, {
        wechatServiceBind: true,
        authUrl,
      } satisfies WechatServiceBindErrorPayload)
    }
  }
  return unpackDataResponse(raw)
}

/** 从 `POST /withdrawals/wechat` 的 `data` 中取出 `package_info`（兼容 snake / camel） */
export function pickWithdrawalPackageInfo(data: unknown): string | null {
  const d = safeRecord(data)
  if (!d) return null
  const v = d.package_info ?? d.packageInfo
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

/** GET /withdrawals */
export async function listWithdrawals(params?: {
  status?: string
  limit?: number
  offset?: number
  userId?: number
}): Promise<{ items: unknown[]; total: number }> {
  const { data } = await http.get<unknown>('/withdrawals', {
    params: {
      ...optionalDevUserId(),
      status: params?.status,
      limit: params?.limit,
      offset: params?.offset,
      ...(params?.userId != null ? { user_id: params.userId } : {}),
    },
  })
  return unpackListResponse(data)
}

/** GET /withdrawals/{withdrawal_id} */
export async function getWithdrawal(withdrawalId: number, extra?: UserIdOpt): Promise<unknown> {
  const { data } = await http.get<unknown>(`/withdrawals/${withdrawalId}`, {
    params: userParams(extra),
  })
  return unpackDataResponse(data)
}
