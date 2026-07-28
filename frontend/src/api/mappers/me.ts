import type { MePayload } from '@/auth/auth-context'
import { safeRecord, safeString } from '@/lib/safe'

function pickAgentLevelDescriptionFromMe(r: Record<string, unknown>): string | null {
  const v = r.agent_level ?? r.agentLevel
  if (v == null || v === '' || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const label = safeString(
    o.description ?? o.name ?? o.title ?? o.package_name ?? o.packageName,
  ).trim()
  return label || null
}

function pickIsAdminFromMe(r: Record<string, unknown>): boolean {
  const v = r.is_admin ?? r.isAdmin
  if (v === true || v === 'true' || v === 1 || v === '1') return true
  if (v === false || v === 'false' || v === 0 || v === '0') return false
  return false
}

function pickWechatServiceBoundFromMe(r: Record<string, unknown>): boolean | null {
  const v = r.wechat_service_bound ?? r.wechatServiceBound
  if (v === true || v === 'true' || v === 1 || v === '1') return true
  if (v === false || v === 'false' || v === 0 || v === '0') return false
  return null
}

/** 从 `/user/me` 原始 data 读取是否已绑定微信服务号（轮询用） */
export function pickWechatServiceBoundFromUserRaw(data: unknown): boolean {
  const r = safeRecord(data)
  const v = pickWechatServiceBoundFromMe(r)
  return v === true
}

/**
 * 将 `/user/me` 中的 `agent_level` 规范为单个正整数，供档位匹配与「是否已加盟」判断。
 * 后端常为对象，例如 `{ id, level, commission_rate, description }`，此处按字段优先级抽取一档有效 id。
 */
function pickAgentLevelFromMe(r: Record<string, unknown>): number | null {
  const v = r.agent_level ?? r.agentLevel
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.trunc(v)
  if (typeof v === 'string' && v.trim()) {
    const n = Number.parseInt(v.trim(), 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  if (typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    const id = o.id ?? o.level_id ?? o.agent_level_id ?? o.agentLevelId ?? o.level
    if (typeof id === 'number' && Number.isFinite(id) && id > 0) return Math.trunc(id)
    const s = String(id ?? '').trim()
    const n = Number.parseInt(s, 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  const s = String(v).trim()
  const n = Number.parseInt(s, 10)
  if (Number.isFinite(n) && n > 0) return n
  return null
}

/**
 * 是否已加盟代理：依赖 {@link mapUserToMePayload} 写入的 `agentLevel`（由接口 `agent_level` 数字或对象归一化而来，不是原始 JSON）。
 */
export function isJoinedAgentFromMe(me: MePayload | null | undefined): me is MePayload & { agentLevel: number } {
  const n = me?.agentLevel
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

/** 将 `/user/me` 等业务返回的用户对象映射为控制台使用的 `MePayload` */
export function mapUserToMePayload(data: unknown): MePayload {
  const r = safeRecord(data) ?? {}
  return {
    id: r.id ?? r.user_id,
    nickname: r.nickname ?? r.name ?? r.username ?? r.display_name,
    avatarUrl: r.avatarUrl ?? r.avatar_url ?? r.avatar,
    isAdmin: pickIsAdminFromMe(r),
    agentLevel: pickAgentLevelFromMe(r),
    agentLevelDescription: pickAgentLevelDescriptionFromMe(r),
    wechatServiceBound: pickWechatServiceBoundFromMe(r),
  }
}
