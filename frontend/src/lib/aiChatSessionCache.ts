/**
 * AI 会话页面临时缓存：同标签页内路由切换可恢复，关标签即清空。
 * 使用 sessionStorage（非 localStorage），避免长期占用磁盘、减少多账号/隐私顾虑。
 */

const STORAGE_PREFIX = 'aitoken.aiChat.v1'

export type AiChatCachedMsg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

export type AiChatSessionCacheV1 = {
  v: 1
  messages: AiChatCachedMsg[]
  model: string
  selectedKeyId: string
  streaming: boolean
  input: string
}

export function aiChatSessionStorageKey(accountKey: string): string {
  return `${STORAGE_PREFIX}:${accountKey}`
}

export function loadAiChatSession(accountKey: string): AiChatSessionCacheV1 | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(aiChatSessionStorageKey(accountKey))
    if (!raw) return null
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null
    const r = o as Record<string, unknown>
    if (r.v !== 1 || !Array.isArray(r.messages)) return null
    return o as AiChatSessionCacheV1
  } catch {
    return null
  }
}

export function saveAiChatSession(accountKey: string, data: AiChatSessionCacheV1): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(aiChatSessionStorageKey(accountKey), JSON.stringify(data))
  } catch {
    /* QuotaExceededError、隐私模式等 */
  }
}

export function clearAiChatSession(accountKey: string): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(aiChatSessionStorageKey(accountKey))
  } catch {
    /* ignore */
  }
}
