import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faWeixin } from '@fortawesome/free-brands-svg-icons'
import logoImg from '@/assets/logo.png'
import { useAuth } from '@/auth/useAuth'
import { fetchWechatLoginPayload, pickWechatQrConnectUrlFromPayload } from '@/api/nexus/auth'
import { readPendingInviteCode } from '@/lib/inviteCode'
import { notify } from '@/lib/toast'
import {
  getWechatQrConnectRedirectUriOrigin,
  LOGIN_INTENDED_PATH_KEY,
  POST_LOGIN_REDIRECT_KEY,
  WECHAT_OAUTH_POPUP_FLOW_KEY,
  syncWeChatOAuthStateFromLoginUrl,
} from '@/lib/wechatOAuth'

type LoginPanelProps = {
  /** 供弹窗 aria-labelledby 使用 */
  titleId?: string
}

export function LoginPanel({ titleId }: LoginPanelProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const { applyMockWechatLogin } = useAuth()
  const [busy, setBusy] = useState(false)

  async function onLogin() {
    if (import.meta.env.VITE_MOCK_WECHAT_LOGIN === 'true') {
      setBusy(true)
      try {
        applyMockWechatLogin()
        notify.success(t('login.toast.wechatMockSignedIn'))
      } finally {
        setBusy(false)
      }
      return
    }

    setBusy(true)
    /** 固定 name 会复用旧窗口导致 `opener` 丢失，控制台等回跳失败 */
    const popupName = `aitoken_wechat_oauth_${crypto.randomUUID()}`
    const popup = window.open(
      'about:blank',
      popupName,
      'width=520,height=720,left=120,top=72,scrollbars=yes,resizable=yes',
    )
    try {
      const clientState = crypto.randomUUID()
      const inviteCode = readPendingInviteCode(location.search)
      const payload = await fetchWechatLoginPayload({
        state: clientState,
        ...(inviteCode ? { invite_code: inviteCode } : {}),
      })
      const url = pickWechatQrConnectUrlFromPayload(payload)
      if (!url) {
        try {
          popup?.close()
        } catch {
          /* ignore */
        }
        notify.error(t('login.toast.wechatUrlMissing'))
        return
      }

      const ruOrigin = getWechatQrConnectRedirectUriOrigin(url)
      if (
        import.meta.env.DEV &&
        ruOrigin &&
        ruOrigin !== window.location.origin
      ) {
        console.warn(
          '[wechat-oauth] redirect_uri origin ≠ 当前页：弹窗回调页可能无法把登录态交回本页，仅开发环境提示',
          { current: window.location.origin, redirectUriOrigin: ruOrigin },
        )
      }

      syncWeChatOAuthStateFromLoginUrl(url, clientState)

      /** 与 `BrowserRouter` basename 一致，勿用 `window.location.pathname`（生产含 `/nexus` 前缀会导致回跳错误） */
      let returnPath = `${location.pathname}${location.search}` || '/'
      try {
        const intended = sessionStorage.getItem(LOGIN_INTENDED_PATH_KEY)
        if (intended && intended.startsWith('/') && !intended.startsWith('//')) {
          returnPath = intended
        }
      } catch {
        /* ignore */
      }
      localStorage.setItem(POST_LOGIN_REDIRECT_KEY, returnPath)

      if (!popup || popup.closed) {
        try {
          localStorage.removeItem(WECHAT_OAUTH_POPUP_FLOW_KEY)
        } catch {
          /* ignore */
        }
        notify.info(t('login.toast.wechatPopupBlocked'), { duration: 6000 })
        window.location.assign(url)
        return
      }
      try {
        localStorage.setItem(WECHAT_OAUTH_POPUP_FLOW_KEY, '1')
      } catch {
        /* ignore */
      }
      popup.location.href = url
      popup.focus()
    } catch {
      try {
        localStorage.removeItem(WECHAT_OAUTH_POPUP_FLOW_KEY)
      } catch {
        /* ignore */
      }
      try {
        popup?.close()
      } catch {
        /* ignore */
      }
      notify.error(t('login.toast.wechatStartFail'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <img
        src={logoImg}
        alt=""
        className="mx-auto h-[4.75rem] w-auto max-w-[9.5rem] object-contain drop-shadow-md"
      />
      <h2 id={titleId} className="mt-6 text-center text-xl font-semibold text-white">
        {t('login.brand')}
      </h2>

      <button
        type="button"
        disabled={busy}
        onClick={() => void onLogin()}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <FontAwesomeIcon icon={faWeixin} className="text-lg" />
        {busy ? t('login.authorizing') : t('login.wechatLogin')}
      </button>
    </>
  )
}
