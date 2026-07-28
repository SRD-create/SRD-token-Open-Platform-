import type { AgentPackageCardRow } from '@/api/mappers/agentPackage'

/** 接口不可用时的默认档位金额（元），仅作占位与校验兜底 */
export const PARTNER_JOIN_FALLBACK_AMOUNTS: readonly number[] = [499, 899, 1299]

/**
 * `/user/me` 的 `agent_level` 可能与 `GET /agents/levels` 条目的 `id` 或与卡片 `level` 序号一致。
 */
export function tierMatchesMeAgentLevel(tier: AgentPackageCardRow, meAgentLevel: number): boolean {
  if (!Number.isFinite(meAgentLevel) || meAgentLevel <= 0) return false
  if (tier.id === meAgentLevel) return true
  if (tier.level > 0 && tier.level === meAgentLevel) return true
  return false
}

export function isPartnerJoinAmount(yuan: number, allowedAmounts: readonly number[]): boolean {
  if (!allowedAmounts.length) {
    return PARTNER_JOIN_FALLBACK_AMOUNTS.includes(yuan)
  }
  return allowedAmounts.includes(yuan)
}

/** 是否为接口返回的可加盟套餐 id（与 {@link isPartnerJoinAmount} 对应，不依赖价格反查） */
export function isPartnerJoinLevelId(
  id: number,
  allowedIds: readonly number[],
): boolean {
  if (!Number.isFinite(id) || id <= 0) return false
  if (!allowedIds.length) return false
  return allowedIds.includes(id)
}

export function defaultPartnerJoinAmount(allowedAmounts: readonly number[]): number {
  if (allowedAmounts.length) return allowedAmounts[0]!
  return PARTNER_JOIN_FALLBACK_AMOUNTS[0]!
}
