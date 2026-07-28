import { http } from '@/api/http'
import { unpackDataResponse } from '@/api/response'
import { safeRecord } from '@/lib/safe'

/** 与 `GET /config/withdrawal-limits` 返回的 data 对齐；数值单位与提现 `amount` 一致（元） */
export type WithdrawalLimitsYuan = {
  readonly minYuan: number | null
  readonly maxYuan: number | null
}

function finiteNonNeg(n: unknown): number | null {
  const v = typeof n === 'number' ? n : typeof n === 'string' ? Number.parseFloat(n.trim()) : NaN
  if (!Number.isFinite(v) || v < 0) return null
  return v
}

/** 解析服务端 `data`（蛇形/驼峰、或包在 `limits` 下） */
export function parseWithdrawalLimitsPayload(data: unknown): WithdrawalLimitsYuan {
  const candidates: unknown[] = [data]
  const r = safeRecord(data)
  if (r) {
    if (r.limits != null) candidates.push(r.limits)
    if (r.withdrawal_limits != null) candidates.push(r.withdrawal_limits)
    if (r.withdrawalLimits != null) candidates.push(r.withdrawalLimits)
  }

  let minYuan: number | null = null
  let maxYuan: number | null = null

  const minKeys = [
    'withdraw_min',
    'withdrawMin',
    'min_amount',
    'minAmount',
    'min_yuan',
    'minimum_amount',
    'min',
  ] as const
  const maxKeys = [
    'withdraw_max',
    'withdrawMax',
    'max_amount',
    'maxAmount',
    'max_yuan',
    'maximum_amount',
    'max',
  ] as const

  for (const src of candidates) {
    const o = safeRecord(src)
    if (!o) continue
    if (minYuan == null) {
      for (const k of minKeys) {
        const x = finiteNonNeg(o[k])
        if (x != null) {
          minYuan = x
          break
        }
      }
    }
    if (maxYuan == null) {
      for (const k of maxKeys) {
        const x = finiteNonNeg(o[k])
        if (x != null) {
          maxYuan = x
          break
        }
      }
    }
    if (minYuan != null && maxYuan != null) break
  }

  if (minYuan != null && maxYuan != null && minYuan > maxYuan) {
    const tmp = minYuan
    minYuan = maxYuan
    maxYuan = tmp
  }

  return { minYuan, maxYuan }
}

/** GET /config/withdrawal-limits — 提现金额上下限（系统配置） */
export async function fetchWithdrawalLimits(): Promise<WithdrawalLimitsYuan> {
  const { data } = await http.get<unknown>('/config/withdrawal-limits')
  const inner = unpackDataResponse(data)
  return parseWithdrawalLimitsPayload(inner)
}

/** 与 `GET /config/topup-limits` 返回的 data 对齐；数值单位为「元」 */
export type TopupLimitsYuan = {
  readonly minYuan: number | null
  readonly maxYuan: number | null
}

/** 解析充值限额（优先最小值；兼容蛇形/驼峰及嵌套 `topup_limits`） */
export function parseTopupLimitsPayload(data: unknown): TopupLimitsYuan {
  const candidates: unknown[] = [data]
  const r = safeRecord(data)
  if (r) {
    if (r.limits != null) candidates.push(r.limits)
    if (r.topup_limits != null) candidates.push(r.topup_limits)
    if (r.topupLimits != null) candidates.push(r.topupLimits)
    if (r.recharge_limits != null) candidates.push(r.recharge_limits)
  }

  let minYuan: number | null = null
  let maxYuan: number | null = null

  const minKeys = [
    'topup_min',
    'topupMin',
    'min_amount',
    'minAmount',
    'min_yuan',
    'minimum_amount',
    'min',
  ] as const
  const maxKeys = [
    'topup_max',
    'topupMax',
    'max_amount',
    'maxAmount',
    'max_yuan',
    'maximum_amount',
    'max',
  ] as const

  for (const src of candidates) {
    const o = safeRecord(src)
    if (!o) continue
    if (minYuan == null) {
      for (const k of minKeys) {
        const x = finiteNonNeg(o[k])
        if (x != null) {
          minYuan = x
          break
        }
      }
    }
    if (maxYuan == null) {
      for (const k of maxKeys) {
        const x = finiteNonNeg(o[k])
        if (x != null) {
          maxYuan = x
          break
        }
      }
    }
    if (minYuan != null && maxYuan != null) break
  }

  if (minYuan != null && maxYuan != null && minYuan > maxYuan) {
    const tmp = minYuan
    minYuan = maxYuan
    maxYuan = tmp
  }

  return { minYuan, maxYuan }
}

/** GET /config/topup-limits — 充值金额限制（系统配置，至少含单笔最低） */
export async function fetchTopupLimits(): Promise<TopupLimitsYuan> {
  const { data } = await http.get<unknown>('/config/topup-limits')
  const inner = unpackDataResponse(data)
  return parseTopupLimitsPayload(inner)
}
