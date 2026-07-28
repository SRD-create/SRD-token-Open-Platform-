/**
 * 用 localStorage 缓存「未登录用户曾从地址栏带入的 invite_code」，避免落地页内路由切换后丢参。
 * 选用 localStorage（而非按窗口隔离的 sessionStorage）：微信 OAuth 弹窗与主站是同源的两个 browsing context，
 * 若仅用 sessionStorage，两边会各持一份待绑定码，`refreshMe` 会几乎同时打出两次 `POST /invites/bind`。
 * 登录成功后由 `AuthContext.refreshMe` 在拉取 `GET /user/me` 之前调用 `POST /invites/bind`（并用 Locks 串行化消费）；
 * 成功或任意失败都会 `clearPendingInviteCode()`，避免无效码导致每次刷新重复请求。
 */
export const PENDING_INVITE_CODE_KEY = 'aitoken_pending_invite_code'

/** 在落地壳内随路由同步：只要 URL 上出现邀请码就写入 localStorage */
export function persistInviteCodeFromSearch(search: string): void {
  const inv = new URLSearchParams(search).get('invite_code')?.trim()
  if (!inv) return
  try {
    localStorage.setItem(PENDING_INVITE_CODE_KEY, inv)
  } catch {
    /* ignore */
  }
}

/** 地址栏有则刷新缓存并返回；否则返回最近一次缓存 */
export function readPendingInviteCode(search: string): string | undefined {
  try {
    const fromUrl = new URLSearchParams(search).get('invite_code')?.trim()
    if (fromUrl) {
      localStorage.setItem(PENDING_INVITE_CODE_KEY, fromUrl)
      return fromUrl
    }
    return localStorage.getItem(PENDING_INVITE_CODE_KEY)?.trim() || undefined
  } catch {
    return new URLSearchParams(search).get('invite_code')?.trim() || undefined
  }
}

export function clearPendingInviteCode(): void {
  try {
    localStorage.removeItem(PENDING_INVITE_CODE_KEY)
  } catch {
    /* ignore */
  }
}
