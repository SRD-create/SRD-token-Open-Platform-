/** 与账户流水接口 `type` 约定一致（大小写不敏感） */
export const KNOWN_ACCOUNT_TRANSACTION_TYPES = [
  'recharge',
  'package',
  'agent_register',
  'reward',
  'commission',
  'usage',
  'withdrawal',
] as const
export type KnownAccountTransactionType = (typeof KNOWN_ACCOUNT_TRANSACTION_TYPES)[number]

export function normalizeAccountTransactionTypeKey(
  raw: string,
): KnownAccountTransactionType | null {
  const t = raw.trim().toLowerCase()
  return (KNOWN_ACCOUNT_TRANSACTION_TYPES as readonly string[]).includes(t)
    ? (t as KnownAccountTransactionType)
    : null
}

const badgeBase =
  'inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-xs font-medium'

/** 账户流水类型：浅色底 + 文字色区分 */
export function accountTransactionTypeBadgeClassName(typeRaw: string): string {
  const k = normalizeAccountTransactionTypeKey(typeRaw)
  switch (k) {
    case 'recharge':
      return `${badgeBase} bg-emerald-500/12 text-emerald-200`
    case 'package':
      return `${badgeBase} bg-violet-500/12 text-violet-200`
    case 'agent_register':
      return `${badgeBase} bg-amber-500/12 text-amber-200`
    case 'reward':
      return `${badgeBase} bg-sky-500/12 text-sky-200`
    case 'commission':
      return `${badgeBase} bg-indigo-500/12 text-indigo-200`
    case 'usage':
      return `${badgeBase} bg-rose-500/12 text-rose-200`
    case 'withdrawal':
      return `${badgeBase} bg-orange-500/12 text-orange-200`
    default:
      return `${badgeBase} bg-white/[0.06] text-zinc-400`
  }
}
