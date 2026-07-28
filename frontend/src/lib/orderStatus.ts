/** 与订单接口 `status` 约定一致（大小写不敏感） */
export const KNOWN_ORDER_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const
export type KnownOrderStatus = (typeof KNOWN_ORDER_STATUSES)[number]

export function normalizeOrderStatusKey(raw: string): KnownOrderStatus | null {
  const u = raw.trim().toUpperCase()
  return (KNOWN_ORDER_STATUSES as readonly string[]).includes(u) ? (u as KnownOrderStatus) : null
}

const badgeBase =
  'inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-xs font-medium'

/** 账单订单状态：浅色底 + 文字色区分，无描边 */
export function orderStatusBadgeClassName(statusRaw: string): string {
  const k = normalizeOrderStatusKey(statusRaw)
  switch (k) {
    case 'PENDING':
      return `${badgeBase} bg-amber-500/12 text-amber-200`
    case 'PAID':
      return `${badgeBase} bg-emerald-500/12 text-emerald-200`
    case 'FAILED':
      return `${badgeBase} bg-red-500/12 text-red-200`
    case 'REFUNDED':
      return `${badgeBase} bg-sky-500/12 text-sky-200`
    default:
      return `${badgeBase} bg-white/[0.06] text-zinc-400`
  }
}
