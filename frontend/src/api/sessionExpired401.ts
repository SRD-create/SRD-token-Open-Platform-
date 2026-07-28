import axios, { type AxiosError } from 'axios'
import i18n from '@/i18n'
import { notify } from '@/lib/toast'

/** 与 `AuthContext` 中登录态一致，请勿随意改名 */
export const AITOKEN_DEMO_TOKEN_LS_KEY = 'aitoken_demo_token'

const sessionExpiredMarker = Symbol.for('aitoken.sessionExpired401')

type MarkedAxios = AxiosError & { [sessionExpiredMarker]?: true }

let handlingSessionExpired401 = false

export function isSessionExpiredAxiosError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false
  return Boolean((err as MarkedAxios)[sessionExpiredMarker])
}

/**
 * 已保存登录 token 时收到 HTTP 401：视为会话失效（常见为 token 过期），提示后跳转登录。
 * 应在 axios 响应错误链中尽早调用；同一轮并发 401 只处理一次。
 */
export function handleSessionExpiredAxios401(err: unknown): void {
  if (!axios.isAxiosError(err)) return
  if (err.response?.status !== 401) return
  if (handlingSessionExpired401) return
  const hadToken = Boolean(localStorage.getItem(AITOKEN_DEMO_TOKEN_LS_KEY))
  if (!hadToken) return

  handlingSessionExpired401 = true
  ;(err as MarkedAxios)[sessionExpiredMarker] = true

  try {
    localStorage.removeItem(AITOKEN_DEMO_TOKEN_LS_KEY)
  } catch {
    /* ignore */
  }

  notify.error(i18n.t('console.auth.tokenExpiredReLogin'), {
    id: 'aitoken-session-expired',
    duration: 4000,
  })
  window.setTimeout(() => {
    const base = import.meta.env.BASE_URL || '/'
    const root = base.endsWith('/') ? base : `${base}/`
    /** 与生产 `base: '/nexus/'` 一致：勿写死 `/`，否则会跳到站点根域上的门户页而非本应用首页 */
    window.location.replace(`${root}?login=1`)
  }, 2000)
}
