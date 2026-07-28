import { forwardRef, useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullhorn, faGlobe, faUser } from '@fortawesome/free-solid-svg-icons'
import { AnnouncementModal } from '@/components/AnnouncementModal'
import logoImg from '@/assets/logo.png'
import { safeString } from '@/lib/safe'
import { useAuth } from '@/auth/useAuth'
import { useLandingSession } from '@/landing/LandingSessionContext'

const fadeUp = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  },
}

/** 顶栏导航项：桌面区占满 header 高度并垂直居中，下划线用伪元素避免 pb+border 把文字顶歪 */
function navItemClass(active: boolean) {
  return [
    'relative flex shrink-0 snap-start items-center whitespace-nowrap px-2 text-sm font-medium transition md:h-full md:px-1',
    'after:pointer-events-none after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:transition-colors',
    active
      ? 'text-white after:bg-sky-500'
      : 'text-zinc-400 after:bg-transparent hover:text-zinc-100',
  ].join(' ')
}

/** 顶栏「公告」与「登录」：固定同宽高（md+） */
const headerAnnounceLoginPillMd =
  'inline-flex h-9 w-[5.5rem] shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border border-white/[0.1] bg-white/[0.04] px-2 text-xs font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white sm:text-sm'

/**
 * 小屏顶栏：`w-auto` 避免死宽留白；`h-9` + 较大左右内边距保证点按与阅读舒适。
 */
const headerAnnounceLoginPillSm =
  'inline-flex h-9 w-auto max-w-[min(100%,11rem)] shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-white/[0.1] bg-white/[0.04] px-2.5 text-[11px] font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white sm:max-w-[12rem] sm:gap-2 sm:px-3 sm:text-xs'

/** 小屏「已登录」头像按钮：与公告胶囊同高 */
const headerUserAvatarPillSm =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.1] bg-white/[0.04] text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white'

/** 桌面「已登录」头像按钮：与公告按钮同高（h-9） */
const headerUserAvatarPillMd =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.1] bg-white/[0.04] text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white'

function safeHttpAvatarUrl(raw: unknown): string {
  const s = safeString(raw).trim()
  if (!s || !/^https?:\/\//i.test(s)) return ''
  return s
}

export const LandingHeader = forwardRef<HTMLElement>(function LandingHeader(_props, ref) {
  const { t, i18n } = useTranslation()
  const { token, me, meLoading, logout } = useAuth()
  const { openLogin } = useLandingSession()
  const [announcementOpen, setAnnouncementOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuWrapSmRef = useRef<HTMLDivElement | null>(null)
  const userMenuWrapMdRef = useRef<HTMLDivElement | null>(null)

  const isZh = i18n.language.startsWith('zh')
  function toggleLanguage() {
    void i18n.changeLanguage(isZh ? 'en' : 'zh')
  }

  const displayName = meLoading ? t('header.profileLoading') : safeString(me?.nickname, t('header.unnamedUser'))
  const avatarSrc = me && !meLoading ? safeHttpAvatarUrl(me.avatarUrl) : ''

  useEffect(() => {
    if (!userMenuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      const inSm = userMenuWrapSmRef.current?.contains(target) ?? false
      const inMd = userMenuWrapMdRef.current?.contains(target) ?? false
      if (!inSm && !inMd) setUserMenuOpen(false)
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [userMenuOpen])

  return (
    <>
      <motion.header
        ref={ref}
        className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.06] bg-surface-950/90 shadow-[0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md"
        initial={false}
        animate="visible"
        variants={fadeUp}
      >
        <div className="mx-auto flex max-w-7xl min-w-0 flex-col gap-2 pb-2 pl-2.5 pr-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:pl-4 sm:pr-3 md:h-16 md:flex-row md:items-stretch md:gap-5 md:py-0 md:pb-0 md:pt-0 md:pl-8 md:pr-[env(safe-area-inset-right,0px)]">
          <div className="flex min-w-0 w-full max-w-full items-center justify-between gap-1.5 sm:gap-2 md:contents">
            <Link
              to="/"
              title={t('header.brand')}
              className="flex min-w-0 max-w-[min(100%,calc(100vw-10.75rem))] flex-1 items-center gap-1.5 sm:max-w-none sm:gap-3 md:h-full md:max-w-none md:min-h-0 md:flex-initial"
            >
              <img
                src={logoImg}
                alt=""
                className="h-5 w-auto shrink-0 object-contain sm:h-6 md:h-8 lg:h-9"
              />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold leading-tight text-white sm:text-sm md:text-base md:flex-initial lg:text-lg">
                {t('header.brand')}
              </span>
            </Link>

            {/* 小屏：顶行右侧 公告 / 登录 同宽胶囊 + 语言（地球图标） */}
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5 md:hidden">
              <button
                type="button"
                onClick={() => setAnnouncementOpen(true)}
                className={headerAnnounceLoginPillSm}
                aria-label={t('header.announce')}
              >
                <FontAwesomeIcon
                  icon={faBullhorn}
                  className="h-3.5 w-3.5 shrink-0 opacity-90 sm:h-4 sm:w-4"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{t('header.announce')}</span>
              </button>
              {token ? (
                <div className="relative" ref={userMenuWrapSmRef}>
                  <button
                    type="button"
                    className={headerUserAvatarPillSm}
                    title={meLoading ? undefined : displayName}
                    aria-label={displayName}
                    aria-haspopup="menu"
                    aria-expanded={userMenuOpen}
                    onClick={() => setUserMenuOpen((v) => !v)}
                  >
                    {meLoading ? (
                      <span
                        className="block h-7 w-7 shrink-0 animate-pulse rounded-full bg-white/10"
                        aria-hidden
                      />
                    ) : avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <FontAwesomeIcon icon={faUser} className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                    )}
                  </button>
                  {userMenuOpen ? (
                    <div className="absolute right-0 top-[calc(100%+0.4rem)] z-50 min-w-[8.5rem] rounded-xl border border-white/10 bg-surface-900/95 p-1 shadow-xl backdrop-blur">
                      <Link
                        to="/console/profile"
                        className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-zinc-200 transition hover:bg-white/10"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        {t('console.shell.nav.profile')}
                      </Link>
                      <button
                        type="button"
                        className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-zinc-200 transition hover:bg-white/10"
                        onClick={() => {
                          setUserMenuOpen(false)
                          logout()
                        }}
                      >
                        {t('console.shell.logout')}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openLogin()}
                  className={headerAnnounceLoginPillSm}
                >
                  <span className="min-w-0 flex-1 truncate text-center">{t('header.login')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={toggleLanguage}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
                aria-label={isZh ? t('header.switchToEn') : t('header.switchToZh')}
                title={isZh ? t('header.switchToEn') : t('header.switchToZh')}
              >
                <FontAwesomeIcon icon={faGlobe} className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          <nav
            className="flex min-h-11 w-full min-w-0 max-w-full touch-pan-x snap-x snap-proximity justify-start gap-1 overflow-x-auto scroll-pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-2 md:min-h-0 md:h-full md:max-w-none md:flex-1 md:items-center md:justify-center md:gap-4 md:overflow-visible md:snap-none lg:gap-6 [&::-webkit-scrollbar]:hidden"
            aria-label={t('header.navAria')}
          >
            <NavLink to="/" end className={({ isActive }) => navItemClass(isActive)}>
              {t('header.home')}
            </NavLink>
            {token ? (
              <Link to="/console/usage" className={navItemClass(false)}>
                {t('header.console')}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => openLogin({ redirectTo: '/console/usage' })}
                className={`${navItemClass(false)} cursor-pointer border-0 bg-transparent font-inherit`}
              >
                {t('header.console')}
              </button>
            )}
            <NavLink to="/models" className={({ isActive }) => navItemClass(isActive)}>
              {t('header.models')}
            </NavLink>
            <NavLink to="/partners" className={({ isActive }) => navItemClass(isActive)}>
              {t('header.partners')}
            </NavLink>
            <NavLink to="/contact" className={({ isActive }) => navItemClass(isActive)}>
              {t('header.contact')}
            </NavLink>
            <NavLink to="/docs" className={({ isActive }) => navItemClass(isActive)}>
              {t('header.apiDocs')}
            </NavLink>
          </nav>

          <div className="hidden shrink-0 items-center gap-1.5 sm:gap-2 md:flex md:h-full md:items-center md:gap-1.5">
            <button
              type="button"
              onClick={() => setAnnouncementOpen(true)}
              className={headerAnnounceLoginPillMd}
            >
              <FontAwesomeIcon icon={faBullhorn} className="shrink-0 opacity-80" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{t('header.announce')}</span>
            </button>
            {token ? (
              <div className="relative" ref={userMenuWrapMdRef}>
                <button
                  type="button"
                  className={headerUserAvatarPillMd}
                  title={meLoading ? undefined : displayName}
                  aria-label={displayName}
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  onClick={() => setUserMenuOpen((v) => !v)}
                >
                  {meLoading ? (
                    <span
                      className="block h-7 w-7 shrink-0 animate-pulse rounded-full bg-white/10"
                      aria-hidden
                    />
                  ) : avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <FontAwesomeIcon icon={faUser} className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                  )}
                </button>
                {userMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.45rem)] z-50 min-w-[9rem] rounded-xl border border-white/10 bg-surface-900/95 p-1 shadow-xl backdrop-blur">
                    <Link
                      to="/console/profile"
                      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-zinc-200 transition hover:bg-white/10 sm:text-sm"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      {t('console.shell.nav.profile')}
                    </Link>
                    <button
                      type="button"
                      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-zinc-200 transition hover:bg-white/10 sm:text-sm"
                      onClick={() => {
                        setUserMenuOpen(false)
                        logout()
                      }}
                    >
                      {t('console.shell.logout')}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openLogin()}
                className={headerAnnounceLoginPillMd}
              >
                <span className="min-w-0 flex-1 truncate text-center">{t('header.login')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
              aria-label={isZh ? t('header.switchToEn') : t('header.switchToZh')}
              title={isZh ? t('header.switchToEn') : t('header.switchToZh')}
            >
              <FontAwesomeIcon icon={faGlobe} className="h-[1.05rem] w-[1.05rem]" aria-hidden />
            </button>
          </div>
        </div>
      </motion.header>
      <AnnouncementModal open={announcementOpen} onClose={() => setAnnouncementOpen(false)} />
    </>
  )
})
