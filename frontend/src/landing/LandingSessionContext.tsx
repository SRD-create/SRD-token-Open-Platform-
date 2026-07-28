import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { LoginModal } from '@/components/LoginModal'
import { useAuth } from '@/auth/useAuth'
import { persistInviteCodeFromSearch } from '@/lib/inviteCode'
import { LOGIN_INTENDED_PATH_KEY } from '@/lib/wechatOAuth'
import {
  PARTNER_JOIN_OPEN_AFTER_LOGIN_KEY,
  PARTNER_JOIN_PENDING_KEY,
  PARTNER_JOIN_TIER_ID_KEY,
  PARTNER_JOIN_TIER_YUAN_KEY,
} from '@/landing/partnerJoinPending'

export type OpenLoginOptions = {
  /** 登录成功并关闭弹窗后执行（例如打开加盟付款弹窗） */
  afterAuth?: () => void
  /** 登录成功后跳转的站内 path（如从「控制台」打开弹窗时用 `/usage`） */
  redirectTo?: string
}

type LandingSessionContextValue = {
  openLogin: (opts?: OpenLoginOptions) => void
}

const LandingSessionContext = createContext<LandingSessionContextValue | null>(null)

/** 写入「登录后回跳」等用途：去掉 login/from，避免把拉起弹窗用的查询串带回地址栏 */
function landingPathWithoutLoginQuery(pathname: string, search: string): string {
  const sp = new URLSearchParams(search)
  sp.delete('login')
  sp.delete('from')
  const q = sp.toString()
  const base = pathname || '/'
  return q ? `${base}?${q}` : base
}

export function LandingSessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loginOpen, setLoginOpen] = useState(false)
  const afterAuthRef = useRef<(() => void) | null>(null)

  /**
   * 未登录：把地址栏里的 invite_code 记入 localStorage（与 `inviteCode.ts` 一致），避免站内跳转后丢参。
   * 已登录：不再写入 pending（绑定在 `AuthContext.refreshMe` 内用登录态调用 `/invites/bind`）。
   */
  useEffect(() => {
    if (token) return
    persistInviteCodeFromSearch(location.search)
  }, [location.search, token])

  /** URL ?login=1（及可选 from）：打开登录弹窗；`from` 为站内 path 时写入登录后回跳目标 */
  useEffect(() => {
    if (searchParams.get('login') !== '1') return
    afterAuthRef.current = null
    const fromRaw = searchParams.get('from')
    if (fromRaw) {
      try {
        const decoded = decodeURIComponent(fromRaw)
        if (decoded.startsWith('/') && !decoded.startsWith('//')) {
          sessionStorage.setItem(LOGIN_INTENDED_PATH_KEY, decoded)
        } else {
          sessionStorage.removeItem(LOGIN_INTENDED_PATH_KEY)
        }
      } catch {
        try {
          sessionStorage.removeItem(LOGIN_INTENDED_PATH_KEY)
        } catch {
          /* ignore */
        }
      }
    } else {
      try {
        sessionStorage.removeItem(LOGIN_INTENDED_PATH_KEY)
      } catch {
        /* ignore */
      }
    }
    setLoginOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete('login')
    next.delete('from')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  /**
   * 未登录且 URL 带 `invite_code`：自动打开登录弹窗（`?login=1` 由上一段 effect 处理，此处跳过以免竞态）。
   */
  useEffect(() => {
    if (token) return
    if (searchParams.get('login') === '1') return
    const inv = new URLSearchParams(location.search).get('invite_code')?.trim()
    if (!inv) return
    const path = landingPathWithoutLoginQuery(location.pathname, location.search)
    if (path.startsWith('/') && !path.startsWith('//')) {
      try {
        sessionStorage.setItem(LOGIN_INTENDED_PATH_KEY, path)
      } catch {
        /* ignore */
      }
    }
    setLoginOpen(true)
  }, [token, location.pathname, location.search, searchParams])

  const openLogin = useCallback((opts?: OpenLoginOptions) => {
    afterAuthRef.current = opts?.afterAuth ?? null
    const raw = opts?.redirectTo?.trim()
    const fallback = `${location.pathname}${location.search}` || '/'
    const pathToStore =
      raw && raw.startsWith('/') && !raw.startsWith('//')
        ? raw
        : fallback.startsWith('/') && !fallback.startsWith('//')
          ? fallback
          : '/'
    try {
      sessionStorage.setItem(LOGIN_INTENDED_PATH_KEY, pathToStore)
    } catch {
      /* ignore */
    }
    if (opts?.afterAuth) {
      try {
        sessionStorage.setItem(PARTNER_JOIN_PENDING_KEY, '1')
      } catch {
        /* ignore quota / private mode */
      }
    }
    setLoginOpen(true)
  }, [location.pathname, location.search])

  const closeLogin = useCallback(() => {
    afterAuthRef.current = null
    try {
      sessionStorage.removeItem(PARTNER_JOIN_PENDING_KEY)
      sessionStorage.removeItem(PARTNER_JOIN_OPEN_AFTER_LOGIN_KEY)
      sessionStorage.removeItem(PARTNER_JOIN_TIER_ID_KEY)
      sessionStorage.removeItem(PARTNER_JOIN_TIER_YUAN_KEY)
      sessionStorage.removeItem(LOGIN_INTENDED_PATH_KEY)
    } catch {
      /* ignore */
    }
    setLoginOpen(false)
  }, [])

  const onLoginAuthenticated = useCallback(() => {
    try {
      sessionStorage.removeItem(PARTNER_JOIN_PENDING_KEY)
    } catch {
      /* ignore */
    }
    let intended: string | null = null
    try {
      intended = sessionStorage.getItem(LOGIN_INTENDED_PATH_KEY)
      sessionStorage.removeItem(LOGIN_INTENDED_PATH_KEY)
    } catch {
      /* ignore */
    }
    const fn = afterAuthRef.current
    afterAuthRef.current = null
    fn?.()
    if (intended && intended.startsWith('/') && !intended.startsWith('//')) {
      const targetPath = (intended.split('?')[0] ?? intended).replace(/\/$/, '') || '/'
      const here =
        (typeof window !== 'undefined'
          ? `${window.location.pathname}`.replace(/\/$/, '') || '/'
          : '') || '/'
      if (targetPath !== here) {
        navigate(intended, { replace: true })
      }
    }
  }, [navigate])

  const value = useMemo(() => ({ openLogin }), [openLogin])

  return (
    <LandingSessionContext.Provider value={value}>
      {children}
      <LoginModal open={loginOpen} onClose={closeLogin} onAuthenticated={onLoginAuthenticated} />
    </LandingSessionContext.Provider>
  )
}

export function useLandingSession() {
  const ctx = useContext(LandingSessionContext)
  if (!ctx) {
    throw new Error('useLandingSession must be used within LandingSessionProvider')
  }
  return ctx
}
