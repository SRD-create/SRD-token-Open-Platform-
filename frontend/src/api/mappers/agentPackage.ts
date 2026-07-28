import { safeRecord, safeString } from '@/lib/safe'

export type AgentPackageCardRow = {
  id: number
  level: number
  name: string
  priceYuan: number
  /** 展示用返佣百分数，如 5 表示 5% */
  rebatePercent: number
  /** 已格式化的百分数字符串，用于文案插值 */
  rebatePercentLabel: string
  /**
   * 限时折扣章上的「OFF」百分数（如 40 表示 40% OFF）。
   * 后端未返回时由页面按档位默认填充。
   */
  discountOffPercent: number | null
  /** 接口无此档时的占位行：标题/价格/返佣展示为「-」，且不可发起加盟 */
  isUnavailable?: boolean
}

/**
 * `commission_rate`：可能是比例小数（如 0.05）或已为百分数（如 5、5.00）。
 * 若数值在 (0,1] 则按比例换算为百分数；否则按已为百分数解析。
 */
export function commissionRateToPercent(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw > 0 && raw <= 1) return raw * 100
    return raw
  }
  const s = String(raw ?? '').trim()
  if (!s) return 0
  const n = Number.parseFloat(s.replace(/,/g, ''))
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n <= 1) return n * 100
  return n
}

function formatPercentForUi(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const x = Math.round(n * 100) / 100
  if (Number.isInteger(x)) return String(x)
  return String(x)
}

function pickDiscountOffPercent(r: Record<string, unknown>): number | null {
  const keys = [
    'discount_off_percent',
    'discountOffPercent',
    'off_percent',
    'offPercent',
    'marketing_off_percent',
    'marketingOffPercent',
    'stamp_off_percent',
  ] as const
  for (const k of keys) {
    const v = r[k]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 100) return Math.round(v)
    if (typeof v === 'string' && v.trim()) {
      const n = Number.parseFloat(v.replace(/,/g, ''))
      if (Number.isFinite(n) && n > 0 && n < 100) return Math.round(n)
    }
  }
  return null
}

export function mapAgentPackageItem(item: unknown): AgentPackageCardRow | null {
  const r = safeRecord(item)
  const level = Number(r.level ?? r.tier ?? r.agent_level ?? 0)
  const id = Number(r.id ?? r.package_id ?? r.level_id ?? (Number.isFinite(level) && level > 0 ? level : NaN))
  const name = safeString(
    r.description ?? r.name ?? r.title ?? r.level_name ?? r.display_name ?? r.tier_name,
  ).trim()
  const priceRaw =
    r.price ?? r.amount ?? r.yuan ?? r.join_fee ?? r.registration_fee ?? r.fee ?? r.deposit
  const priceYuan =
    typeof priceRaw === 'number' && Number.isFinite(priceRaw)
      ? priceRaw
      : Number.parseFloat(String(priceRaw ?? '').replace(/,/g, ''))
  if (!Number.isFinite(id) || id <= 0) return null
  if (!Number.isFinite(priceYuan) || priceYuan <= 0) return null
  if (!name) return null
  const pct = commissionRateToPercent(
    r.commission_rate ?? r.commissionRate ?? r.rebate_rate ?? r.rebate_percent,
  )
  const rebatePercent = Number.isFinite(pct) ? pct : 0
  return {
    id,
    level: Number.isFinite(level) ? level : 0,
    name,
    priceYuan,
    rebatePercent,
    rebatePercentLabel: formatPercentForUi(rebatePercent),
    discountOffPercent: pickDiscountOffPercent(r),
  }
}
