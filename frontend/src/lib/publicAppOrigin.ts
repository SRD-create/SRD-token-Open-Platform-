/**
 * 生成「手机扫码可打开」的页面 URL 时使用的站点根（协议 + 主机 + 端口），不含 path。
 *
 * 开发时若在 PC 上用 `http://localhost:5173` 打开，`window.location.origin` 写进二维码后，
 * 手机会访问手机本机的 localhost，必然失败。此时请在 `.env.development` 配置
 * `VITE_PUBLIC_APP_ORIGIN=http://<本机局域网IP>:5173`，并用该地址在同一 WiFi 下访问控制台。
 */
export function hasPublicAppOriginOverride(): boolean {
  const v = (import.meta.env.VITE_PUBLIC_APP_ORIGIN as string | undefined)?.trim()
  return Boolean(v && /^https?:\/\//i.test(v))
}

/** 仅用于微信「确认收款」扫码链接；与 `VITE_PUBLIC_APP_ORIGIN` 二选一或同时配置时以此项优先 */
export function hasWechatConfirmQrOriginOverride(): boolean {
  const v = (import.meta.env.VITE_WECHAT_CONFIRM_QR_ORIGIN as string | undefined)?.trim()
  return Boolean(v && /^https?:\/\//i.test(v))
}

/**
 * 佣金提现扫码打开的 `/wechat-confirm` 页面使用的站点根。
 * 优先 `VITE_WECHAT_CONFIRM_QR_ORIGIN`（本地 dev 可填线上 `https://your-domain.com`，手机扫生产 H5），
 * 否则回退 `resolveQrPageOrigin()`（`VITE_PUBLIC_APP_ORIGIN` 或当前页 origin）。
 */
export function resolveWechatMerchantConfirmQrOrigin(): string {
  const qr = (import.meta.env.VITE_WECHAT_CONFIRM_QR_ORIGIN as string | undefined)?.trim()
  if (qr && /^https?:\/\//i.test(qr)) {
    return qr.replace(/\/$/, '')
  }
  return resolveQrPageOrigin()
}

export function resolveQrPageOrigin(): string {
  const raw = (import.meta.env.VITE_PUBLIC_APP_ORIGIN as string | undefined)?.trim()
  if (raw && /^https?:\/\//i.test(raw)) {
    return raw.replace(/\/$/, '')
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

export function isOriginLocalhost(origin: string): boolean {
  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}
