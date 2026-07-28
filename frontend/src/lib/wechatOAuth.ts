/**
 * 微信扫码登录：跳转 URL 由后端 `GET /auth/wechat/login` 返回；此处仅保存 OAuth state 与登录后回跳路径。
 * 开放平台文档：https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html
 *
 * 与弹窗 OAuth 相关的 state / 回跳 / 弹窗标记必须使用 **localStorage**：`window.open` 子窗口与父窗口的
 * **sessionStorage 相互隔离**，子窗读不到父窗写入的 state，会导致换票失败、主站弹窗不关。
 */

export const WECHAT_OAUTH_STATE_KEY = 'aitoken_wx_oauth_state'

/** 微信扫码跳转前写入；回调页读取（localStorage，与父窗共享） */
export const POST_LOGIN_REDIRECT_KEY = 'aitoken_post_login_redirect'

/** 从登录弹窗传入（如点击「控制台」）；优先于当前 URL 写入 {@link POST_LOGIN_REDIRECT_KEY} */
export const LOGIN_INTENDED_PATH_KEY = 'aitoken_login_intended_path'

/** Vite `base` 去掉末尾 `/`，与 `BrowserRouter` basename 一致（开发多为 `''`） */
function viteBaseTrim(): string {
  return (import.meta.env.BASE_URL || '/').replace(/\/?$/, '')
}

/**
 * 与 `useLocation()` 的 pathname+search 一致：生产 `base` 为 `/nexus` 时，浏览器为 `/nexus/partners`，此处为 `/partners`。
 * {@link POST_LOGIN_REDIRECT_KEY} 应存此形式，以便 `navigate(next)` 与弹窗路径比对正确。
 */
export function routerLocationPathFromWindow(): string {
  if (typeof window === 'undefined') return '/'
  const { pathname, search } = window.location
  const base = viteBaseTrim()
  if (!base) return `${pathname}${search}` || '/'
  if (pathname === base || pathname.startsWith(`${base}/`)) {
    const rest = pathname === base ? '/' : pathname.slice(base.length) || '/'
    const normalized = rest.startsWith('/') ? rest : `/${rest}`
    return `${normalized}${search}` || '/'
  }
  return `${pathname}${search}` || '/'
}

/**
 * 微信 `redirect_uri` 的 pathname 须与线上部署一致（含 `base`，如 `/nexus/auth/wechat/callback`）。
 * 完整 URL 为 `origin + getWechatOAuthCallbackPathname()`。
 */
export function getWechatOAuthCallbackPathname(): string {
  const base = viteBaseTrim()
  const suffix = '/auth/wechat/callback'
  if (!base) return suffix
  return `${base}${suffix}`
}

/**
 * 将 `state` 写入 localStorage，供 `/auth/wechat/callback` 与微信回跳比对。
 * 若后端返回的 URL 上带有 `state` 查询参数，则优先采用该值（与微信回调一致）。
 */
/** 从微信 `qrconnect` 链接中解析 `redirect_uri` 的 `origin`；失败返回 `null`。 */
export function getWechatQrConnectRedirectUriOrigin(loginUrl: string): string | null {
  try {
    const u = new URL(loginUrl)
    const enc = u.searchParams.get('redirect_uri')?.trim()
    if (!enc) return null
    const decoded = decodeURIComponent(enc)
    return new URL(decoded).origin
  } catch {
    return null
  }
}

export function syncWeChatOAuthStateFromLoginUrl(loginUrl: string, clientState: string): void {
  try {
    const u = new URL(loginUrl)
    const fromUrl = u.searchParams.get('state')?.trim()
    localStorage.setItem(WECHAT_OAUTH_STATE_KEY, fromUrl || clientState)
  } catch {
    localStorage.setItem(WECHAT_OAUTH_STATE_KEY, clientState)
  }
}

/** 与 {@link wechatOAuthTryNotifyOpener} 配套，主窗口在 AuthProvider 中监听 */
export const WECHAT_OAUTH_MESSAGE_TYPE = 'aitoken-wechat-oauth' as const

/** 同源任意窗口可收；不依赖 `window.opener`（部分浏览器跨域跳转后会丢 opener） */
export const WECHAT_OAUTH_BC_NAME = 'aitoken_wechat_oauth_bc_v1'

export type WechatOAuthOpenerMessage =
  | { type: typeof WECHAT_OAUTH_MESSAGE_TYPE; ok: true; next: string; nonce?: string }
  | { type: typeof WECHAT_OAUTH_MESSAGE_TYPE; ok: false; message: string; nonce?: string }

export function wechatOAuthBroadcastCompletion(
  payload: { ok: true; next: string } | { ok: false; message: string },
  nonce: string,
): void {
  try {
    if (typeof BroadcastChannel === 'undefined') return
    const msg: WechatOAuthOpenerMessage =
      payload.ok === true
        ? { type: WECHAT_OAUTH_MESSAGE_TYPE, ok: true, next: payload.next, nonce }
        : { type: WECHAT_OAUTH_MESSAGE_TYPE, ok: false, message: payload.message, nonce }
    const bc = new BroadcastChannel(WECHAT_OAUTH_BC_NAME)
    bc.postMessage(msg)
    bc.close()
  } catch {
    /* ignore */
  }
}

/**
 * 若当前页为 `window.open` 打开的 OAuth 子窗口，则通知 opener 并关闭本窗口。
 * 返回 `true` 表示已交给 opener，调用方勿再 `navigate` 本窗口。
 */
export function wechatOAuthTryNotifyOpener(
  payload: { ok: true; next: string } | { ok: false; message: string },
  nonce: string,
): boolean {
  try {
    const o = window.opener as Window | null
    if (!o || o === window) return false
    try {
      if (o.closed) return false
    } catch {
      return false
    }
    const msg: WechatOAuthOpenerMessage =
      payload.ok === true
        ? { type: WECHAT_OAUTH_MESSAGE_TYPE, ok: true, next: payload.next, nonce }
        : { type: WECHAT_OAUTH_MESSAGE_TYPE, ok: false, message: payload.message, nonce }
    try {
      o.focus()
    } catch {
      /* 部分环境限制由 opener 自行 focus */
    }
    o.postMessage(msg, window.location.origin)
    window.close()
    return true
  } catch {
    return false
  }
}

/** 本次授权是否从主站 `LoginPanel` 弹窗发起（与整页跳转区分） */
export const WECHAT_OAUTH_POPUP_FLOW_KEY = 'aitoken_wx_oauth_popup_flow'

/** 弹窗内换票成功但 `window.opener` 不可用时，写入主窗口可监听的回跳 path */
export const WECHAT_OAUTH_NAV_BROADCAST_KEY = 'aitoken_wx_oauth_popup_nav'

/** 同上，用于错误提示 */
export const WECHAT_OAUTH_ERR_BROADCAST_KEY = 'aitoken_wx_oauth_popup_err'

function clearWechatOAuthPopupFlowFlag(): void {
  try {
    localStorage.removeItem(WECHAT_OAUTH_POPUP_FLOW_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * 在 OAuth 回调页：优先 `postMessage` 通知 opener；失败且本次为弹窗流程时，用 `localStorage` 广播给主窗口并 `close`。
 * 返回 `true` 表示已处理完毕（本窗口应关闭或已关闭），调用方勿再对本窗口 `navigate`。
 */
export function wechatOAuthNotifyOpenerOrBroadcast(
  payload: { ok: true; next: string } | { ok: false; message: string },
): boolean {
  const nonce = crypto.randomUUID()
  wechatOAuthBroadcastCompletion(payload, nonce)

  if (wechatOAuthTryNotifyOpener(payload, nonce)) {
    clearWechatOAuthPopupFlowFlag()
    return true
  }
  try {
    if (localStorage.getItem(WECHAT_OAUTH_POPUP_FLOW_KEY) !== '1') return false
    clearWechatOAuthPopupFlowFlag()
    if (payload.ok === true) {
      localStorage.setItem(
        WECHAT_OAUTH_NAV_BROADCAST_KEY,
        JSON.stringify({ next: payload.next, nonce }),
      )
    } else {
      localStorage.setItem(
        WECHAT_OAUTH_ERR_BROADCAST_KEY,
        JSON.stringify({ message: payload.message, nonce }),
      )
    }
    window.close()
    return true
  } catch {
    return false
  }
}
