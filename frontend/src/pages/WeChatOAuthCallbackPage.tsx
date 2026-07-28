import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { NexusBizError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import logoImg from '@/assets/logo.png'
import { notify } from '@/lib/toast'
import {
  PARTNER_JOIN_OPEN_AFTER_LOGIN_KEY,
  PARTNER_JOIN_PENDING_KEY,
  PARTNER_JOIN_TIER_ID_KEY,
  PARTNER_JOIN_TIER_YUAN_KEY,
} from '@/landing/partnerJoinPending'
import {
  LOGIN_INTENDED_PATH_KEY,
  POST_LOGIN_REDIRECT_KEY,
  WECHAT_OAUTH_STATE_KEY,
  wechatOAuthNotifyOpenerOrBroadcast,
} from '@/lib/wechatOAuth'

/**
 * 微信开放平台扫码登录回调：?code=...&state=...
 * 生产环境 `redirect_uri` 的 pathname 须为 `getWechatOAuthCallbackPathname()`（含 Vite `base`，如 `/nexus/auth/wechat/callback`），
 * 与本路由一致；换票为前端请求 `GET /auth/wechat/callback?code=`。
 */
export function WeChatOAuthCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { loginWithWeChatCode } = useAuth()
  const ran = useRef(false)
  const [hint, setHint] = useState('正在完成微信登录…')

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const run = async () => {
      const err = searchParams.get('error')
      const errDesc = searchParams.get('error_description')
      if (err) {
        const msg = errDesc || '用户取消或未同意授权'
        try {
          sessionStorage.removeItem(PARTNER_JOIN_PENDING_KEY)
          sessionStorage.removeItem(PARTNER_JOIN_OPEN_AFTER_LOGIN_KEY)
          sessionStorage.removeItem(PARTNER_JOIN_TIER_ID_KEY)
          sessionStorage.removeItem(PARTNER_JOIN_TIER_YUAN_KEY)
        } catch {
          /* ignore */
        }
        if (wechatOAuthNotifyOpenerOrBroadcast({ ok: false, message: msg })) return
        notify.error(msg)
        navigate('/?login=1', { replace: true })
        return
      }

      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const saved = localStorage.getItem(WECHAT_OAUTH_STATE_KEY)
      localStorage.removeItem(WECHAT_OAUTH_STATE_KEY)

      const stateOk =
        Boolean(state && saved && state === saved) ||
        (import.meta.env.DEV && state === 'STATE' && Boolean(code))

      if (!code || !state || !stateOk) {
        const msg = '授权无效或已过期，请重新登录'
        try {
          sessionStorage.removeItem(PARTNER_JOIN_PENDING_KEY)
          sessionStorage.removeItem(PARTNER_JOIN_OPEN_AFTER_LOGIN_KEY)
          sessionStorage.removeItem(PARTNER_JOIN_TIER_ID_KEY)
          sessionStorage.removeItem(PARTNER_JOIN_TIER_YUAN_KEY)
        } catch {
          /* ignore */
        }
        if (wechatOAuthNotifyOpenerOrBroadcast({ ok: false, message: msg })) return
        notify.error(msg)
        navigate('/?login=1', { replace: true })
        return
      }

      try {
        await loginWithWeChatCode(code)
        const nextRaw = localStorage.getItem(POST_LOGIN_REDIRECT_KEY)
        localStorage.removeItem(POST_LOGIN_REDIRECT_KEY)
        try {
          sessionStorage.removeItem(LOGIN_INTENDED_PATH_KEY)
        } catch {
          /* ignore */
        }
        const next =
          nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/'
        if (wechatOAuthNotifyOpenerOrBroadcast({ ok: true, next })) return
        notify.success('登录成功')
        navigate(next, { replace: true })
      } catch (e) {
        setHint('登录失败')
        const msg =
          e instanceof NexusBizError
            ? e.message
            : e instanceof Error
              ? e.message
              : '登录失败，请重试'
        try {
          sessionStorage.removeItem(PARTNER_JOIN_PENDING_KEY)
          sessionStorage.removeItem(PARTNER_JOIN_OPEN_AFTER_LOGIN_KEY)
          sessionStorage.removeItem(PARTNER_JOIN_TIER_ID_KEY)
          sessionStorage.removeItem(PARTNER_JOIN_TIER_YUAN_KEY)
        } catch {
          /* ignore */
        }
        if (wechatOAuthNotifyOpenerOrBroadcast({ ok: false, message: msg })) return
        notify.error(msg)
        navigate('/?login=1', { replace: true })
      }
    }

    void run()
  }, [searchParams, navigate, loginWithWeChatCode])

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-surface-950 px-4">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[20rem] w-[20rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500/12 blur-3xl"
        aria-hidden
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-surface-900/85 p-6 text-center shadow-2xl backdrop-blur-sm">
        <img src={logoImg} alt="" className="mx-auto h-16 w-16 rounded-xl object-cover shadow-lg" />
        <h1 className="mt-4 text-base font-semibold text-white">微信授权登录</h1>
        <p className="mt-2 text-sm text-zinc-300">{hint}</p>
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-zinc-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
          正在与服务器同步登录态
        </div>
      </div>
    </div>
  )
}
