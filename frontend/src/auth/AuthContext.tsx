import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { pickAccessToken, pickEmbeddedUserFromAuthPayload } from '@/api/authToken'
import { NexusBizError } from '@/api/errors'
import { AITOKEN_DEMO_TOKEN_LS_KEY, isSessionExpiredAxiosError } from '@/api/sessionExpired401'
import { exchangeWechatOAuthCode } from '@/api/nexus/auth'
import { bindInviteCode } from '@/api/nexus/invites'
import { fetchCurrentUser } from '@/api/nexus/user'
import { mapUserToMePayload } from '@/api/mappers/me'
import i18n from '@/i18n'
import { clearPendingInviteCode, readPendingInviteCode } from '@/lib/inviteCode'
import {
  routerLocationPathFromWindow,
  WECHAT_OAUTH_BC_NAME,
  WECHAT_OAUTH_ERR_BROADCAST_KEY,
  WECHAT_OAUTH_MESSAGE_TYPE,
  WECHAT_OAUTH_NAV_BROADCAST_KEY,
} from '@/lib/wechatOAuth'
import { notify } from '@/lib/toast'
import { AuthContext, type MePayload } from './auth-context'
import { isMockWechatSessionToken, MOCK_WECHAT_SESSION_TOKEN_PREFIX } from './mockWechatSession'

function i18nLanguageBase(l: string | undefined | null): string {
  if (l == null || l === '') return ''
  return String(l).split('-')[0]?.toLowerCase() ?? ''
}

function wechatOAuthPathDiffersFromCurrent(next: string): boolean {
  if (!next.startsWith('/') || next.startsWith('//')) return false
  return routerLocationPathFromWindow() !== next
}

/** 微信 OAuth 子窗关闭后，将焦点拉回主站（部分浏览器仍可能拦截） */
function focusMainWindowAfterOAuth(): void {
  queueMicrotask(() => {
    try {
      window.focus()
    } catch {
      /* ignore */
    }
  })
}

function parseOAuthNavBroadcast(raw: string): { next: string; nonce?: string } | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const o = JSON.parse(trimmed) as { next?: unknown; nonce?: unknown }
    if (typeof o.next === 'string' && o.next.startsWith('/') && !o.next.startsWith('//')) {
      return {
        next: o.next,
        nonce: typeof o.nonce === 'string' && o.nonce ? o.nonce : undefined,
      }
    }
  } catch {
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return { next: trimmed }
  }
  return null
}

function parseOAuthErrBroadcast(raw: string): { message: string; nonce?: string } | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const o = JSON.parse(trimmed) as { message?: unknown; nonce?: unknown }
    if (typeof o.message === 'string' && o.message) {
      return {
        message: o.message,
        nonce: typeof o.nonce === 'string' && o.nonce ? o.nonce : undefined,
      }
    }
  } catch {
    return { message: trimmed }
  }
  return null
}

export type { MePayload } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(AITOKEN_DEMO_TOKEN_LS_KEY))
  const [me, setMe] = useState<MePayload | null>(null)
  /** 有 token 时先为 true，避免首帧 `me` 仍为 null 时子页面误判（如未拉完 /user/me 就显示「非代理」） */
  const [meLoading, setMeLoading] = useState(
    () => Boolean(typeof localStorage !== 'undefined' && localStorage.getItem(AITOKEN_DEMO_TOKEN_LS_KEY)),
  )
  const wechatOAuthHandledKeys = useRef(new Set<string>())
  /** 与 i18n 当前语言对比，避免 `languageChanged` 与首屏 `refreshMe` 重复打 /user/me */
  const meLanguageBaseRef = useRef<string>('')

  const refreshMe = useCallback(async () => {
    if (!token) {
      setMe(null)
      setMeLoading(false)
      return
    }
    if (isMockWechatSessionToken(token)) {
      setMe((prev) =>
        prev ?? {
          id: 0,
          nickname: i18n.t('login.mockWechat.nickname'),
          avatarUrl: undefined,
          isAdmin: false,
          agentLevel: null,
        },
      )
      setMeLoading(false)
      return
    }
    setMeLoading(true)
    try {
      const bindIfPending = async () => {
        const pendingInvite = readPendingInviteCode('')
        if (!pendingInvite) return
        clearPendingInviteCode()
        try {
          await bindInviteCode(pendingInvite)
        } catch (e) {
          const msg =
            e instanceof NexusBizError
              ? e.message
              : e instanceof Error
                ? e.message
                : i18n.t('console.auth.inviteBindFailed')
          notify.error(msg || i18n.t('console.auth.inviteBindFailed'), { duration: 5000 })
        }
      }
      if (typeof navigator !== 'undefined' && navigator.locks?.request) {
        await navigator.locks.request('aitoken:pending-invite-bind', bindIfPending)
      } else {
        await bindIfPending()
      }
      const raw = await fetchCurrentUser()
      setMe(mapUserToMePayload(raw))
    } catch (e) {
      setMe(null)
      if (isSessionExpiredAxiosError(e)) {
        return
      }
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : i18n.t('console.auth.fetchMeFailed')
      notify.error(msg || i18n.t('console.auth.fetchMeFailed'), {
        duration: 5000,
        action: {
          label: i18n.t('console.auth.retry'),
          onClick: () => {
            void refreshMe()
          },
        },
      })
    } finally {
      setMeLoading(false)
    }
  }, [token])

  useEffect(() => {
    void refreshMe()
  }, [refreshMe])

  useEffect(() => {
    if (!token || isMockWechatSessionToken(token)) return
    meLanguageBaseRef.current = i18nLanguageBase(i18n.resolvedLanguage ?? i18n.language)

    const onLanguageChanged = (lng: string) => {
      if (!token || isMockWechatSessionToken(token)) return
      const next = i18nLanguageBase(lng)
      if (meLanguageBaseRef.current === next) return
      meLanguageBaseRef.current = next
      void refreshMe()
    }

    i18n.on('languageChanged', onLanguageChanged)
    return () => {
      i18n.off('languageChanged', onLanguageChanged)
    }
  }, [token, refreshMe])

  const deliverWechatOAuthBridge = useCallback(
    (
      payload:
        | { ok: true; next: string; nonce?: string }
        | { ok: false; message: string; nonce?: string },
    ) => {
      /** 回调页自身也挂了 AuthProvider，会收到同一条 BC；只让主站/其它页消费 */
      if (routerLocationPathFromWindow().startsWith('/auth/wechat/callback')) return

      const dedupeKey =
        payload.nonce != null && payload.nonce !== ''
          ? `wx:${payload.nonce}`
          : payload.ok
            ? `wx:ok:${payload.next}`
            : `wx:err:${payload.message}`
      if (wechatOAuthHandledKeys.current.has(dedupeKey)) return
      wechatOAuthHandledKeys.current.add(dedupeKey)
      if (wechatOAuthHandledKeys.current.size > 48) wechatOAuthHandledKeys.current.clear()

      if (payload.ok) {
        const t = localStorage.getItem(AITOKEN_DEMO_TOKEN_LS_KEY)
        if (t) setToken(t)
        notify.success(i18n.t('login.toast.wechatSignedIn'))
        if (wechatOAuthPathDiffersFromCurrent(payload.next)) {
          void navigate(payload.next, { replace: true })
        }
        focusMainWindowAfterOAuth()
      } else {
        notify.error(payload.message)
        focusMainWindowAfterOAuth()
      }
    },
    [navigate],
  )

  /** 其它窗口（微信 OAuth 弹窗）写入 token；回跳/错误走 JSON 广播（与 BroadcastChannel 共用 nonce 去重） */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage) return
      if (e.key === AITOKEN_DEMO_TOKEN_LS_KEY) {
        setToken(e.newValue)
        return
      }
      if (e.key === WECHAT_OAUTH_NAV_BROADCAST_KEY && e.newValue) {
        const parsed = parseOAuthNavBroadcast(e.newValue)
        if (!parsed) return
        try {
          localStorage.removeItem(WECHAT_OAUTH_NAV_BROADCAST_KEY)
        } catch {
          /* ignore */
        }
        deliverWechatOAuthBridge({ ok: true, next: parsed.next, nonce: parsed.nonce })
        return
      }
      if (e.key === WECHAT_OAUTH_ERR_BROADCAST_KEY && e.newValue) {
        const parsed = parseOAuthErrBroadcast(e.newValue)
        if (!parsed) return
        try {
          localStorage.removeItem(WECHAT_OAUTH_ERR_BROADCAST_KEY)
        } catch {
          /* ignore */
        }
        deliverWechatOAuthBridge({
          ok: false,
          message: parsed.message,
          nonce: parsed.nonce,
        })
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [deliverWechatOAuthBridge])

  /** 同源 BroadcastChannel：`opener` 丢失时仍能收到 OAuth 完成事件 */
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(WECHAT_OAUTH_BC_NAME)
    ch.onmessage = (event: MessageEvent) => {
      const d = event.data as {
        type?: string
        ok?: boolean
        next?: string
        message?: string
        nonce?: string
      }
      if (!d || d.type !== WECHAT_OAUTH_MESSAGE_TYPE) return
      if (d.ok === true) {
        if (typeof d.next !== 'string' || !d.next.startsWith('/') || d.next.startsWith('//')) return
        deliverWechatOAuthBridge({
          ok: true,
          next: d.next,
          nonce: typeof d.nonce === 'string' ? d.nonce : undefined,
        })
        return
      }
      if (d.ok === false && typeof d.message === 'string') {
        deliverWechatOAuthBridge({
          ok: false,
          message: d.message,
          nonce: typeof d.nonce === 'string' ? d.nonce : undefined,
        })
      }
    }
    return () => ch.close()
  }, [deliverWechatOAuthBridge])

  /** 弹窗 OAuth：`postMessage`（仍有 opener 时） */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const d = e.data as {
        type?: string
        ok?: boolean
        next?: string
        message?: string
        nonce?: string
      }
      if (!d || d.type !== WECHAT_OAUTH_MESSAGE_TYPE) return
      if (d.ok === true) {
        if (typeof d.next !== 'string' || !d.next.startsWith('/') || d.next.startsWith('//')) return
        deliverWechatOAuthBridge({
          ok: true,
          next: d.next,
          nonce: typeof d.nonce === 'string' ? d.nonce : undefined,
        })
        return
      }
      if (d.ok === false && typeof d.message === 'string') {
        deliverWechatOAuthBridge({
          ok: false,
          message: d.message,
          nonce: typeof d.nonce === 'string' ? d.nonce : undefined,
        })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [deliverWechatOAuthBridge])

  const applyMockWechatLogin = useCallback(() => {
    if (import.meta.env.VITE_MOCK_WECHAT_LOGIN !== 'true') return
    const t = `${MOCK_WECHAT_SESSION_TOKEN_PREFIX}${Date.now()}`
    try {
      localStorage.setItem(AITOKEN_DEMO_TOKEN_LS_KEY, t)
    } catch {
      /* ignore */
    }
    setToken(t)
    setMe({
      id: 0,
      nickname: i18n.t('login.mockWechat.nickname'),
      avatarUrl: undefined,
      isAdmin: false,
    })
    setMeLoading(false)
    clearPendingInviteCode()
  }, [])

  const applyTokenLogin = useCallback((rawToken: string) => {
    const next = rawToken.trim()
    if (!next) return
    try {
      localStorage.setItem(AITOKEN_DEMO_TOKEN_LS_KEY, next)
    } catch {
      /* ignore */
    }
    setToken(next)
    setMe(null)
    setMeLoading(true)
  }, [])

  const loginWithWeChatCode = useCallback(async (code: string) => {
    const raw = await exchangeWechatOAuthCode(code)
    const t = pickAccessToken(raw)
    if (t) {
      localStorage.setItem(AITOKEN_DEMO_TOKEN_LS_KEY, t)
      setToken(t)
      const embedded = pickEmbeddedUserFromAuthPayload(raw)
      if (embedded) {
        setMe(mapUserToMePayload(embedded))
        setMeLoading(false)
      }
      return
    }
    throw new Error('登录响应中未找到 token')
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(AITOKEN_DEMO_TOKEN_LS_KEY)
    clearPendingInviteCode()
    setToken(null)
    setMe(null)
    setMeLoading(false)
    notify.success(i18n.t('console.auth.loggedOut'))
    navigate('/', { replace: true })
  }, [navigate])

  const value = useMemo(
    () => ({
      token,
      me,
      meLoading,
      loginWithWeChatCode,
      applyMockWechatLogin,
      applyTokenLogin,
      logout,
      refreshMe,
    }),
    [
      token,
      me,
      meLoading,
      loginWithWeChatCode,
      applyMockWechatLogin,
      applyTokenLogin,
      logout,
      refreshMe,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
