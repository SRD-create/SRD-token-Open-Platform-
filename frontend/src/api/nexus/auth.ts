import { pickAccessToken } from '@/api/authToken'
import { http } from '@/api/http'
import { NexusBizError } from '@/api/errors'
import { unpackDataResponse } from '@/api/response'
import { safeRecord, safeString } from '@/lib/safe'

/** GET /auth/wechat/login — 返回内含微信 `qrconnect` 完整 URL（由后端配置 appid、redirect_uri 等） */
export async function fetchWechatLoginPayload(options?: {
  state?: string
  /** 与后端约定：有邀请码时作为 query `invite_code` 传入 */
  invite_code?: string
}): Promise<unknown> {
  const params: Record<string, string> = {}
  if (options?.state) params.state = options.state
  const inv = options?.invite_code?.trim()
  if (inv) params.invite_code = inv
  const { data } = await http.get<unknown>('/auth/wechat/login', {
    params: Object.keys(params).length ? params : undefined,
  })
  return unpackDataResponse(data)
}

/** 从 `/auth/wechat/login` 的 `data` 中取出可跳转的微信扫码 URL */
export function pickWechatQrConnectUrlFromPayload(payload: unknown): string | null {
  const o = safeRecord(payload)
  const u = safeString(o.url).trim()
  if (/^https?:\/\//i.test(u)) return u
  return null
}

/** GET /auth/wechat/callback — 用 code 换取登录态（通常为 token，可含 user） */
export async function exchangeWechatOAuthCode(code: string): Promise<unknown> {
  const { data } = await http.get<unknown>('/auth/wechat/callback', {
    params: { code },
  })
  try {
    return unpackDataResponse(data)
  } catch (e) {
    const rec = safeRecord(data)
    const inner = safeRecord(rec?.data)
    if (inner && pickAccessToken(inner)) return inner
    if (rec && pickAccessToken(rec)) return rec
    if (e instanceof NexusBizError) throw e
    throw new NexusBizError('微信换票返回格式异常', -1, data)
  }
}

