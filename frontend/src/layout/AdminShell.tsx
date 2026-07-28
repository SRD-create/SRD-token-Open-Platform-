import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBars,
  faChevronLeft,
  faGaugeHigh,
  faGlobe,
  faHandshake,
  faLayerGroup,
  faRightFromBracket,
  faSliders,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/useAuth'
import { safeString } from '@/lib/safe'
import logoImg from '@/assets/logo.png'
import type { AppShellOutletContext } from './app-shell-outlet-context'

const HEADER_H = 'h-16'

const adminNavItems = [
  { to: '/admin/dashboard', labelKey: 'admin.nav.dashboard' as const, icon: faGaugeHigh },
  { to: '/admin/system', labelKey: 'admin.nav.system' as const, icon: faSliders },
  { to: '/admin/agent-levels', labelKey: 'admin.nav.agentLevels' as const, icon: faHandshake },
  { to: '/admin/packages', labelKey: 'admin.nav.packages' as const, icon: faLayerGroup },
]

const titleKeyByPath: Record<string, (typeof adminNavItems)[number]['labelKey']> = {
  '/admin/dashboard': 'admin.nav.dashboard',
  '/admin/system': 'admin.nav.system',
  '/admin/agent-levels': 'admin.nav.agentLevels',
  '/admin/packages': 'admin.nav.packages',
}

export function AdminShell({ children }: { children?: ReactNode }) {
  const { t, i18n } = useTranslation()
  const { me, meLoading, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [headerRight, setHeaderRight] = useState<ReactNode>(null)

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  useLayoutEffect(() => {
    document.documentElement.classList.add('shell-viewport-lock')
    return () => {
      document.documentElement.classList.remove('shell-viewport-lock')
    }
  }, [])

  const pageTitle = t(titleKeyByPath[location.pathname] ?? 'admin.brandTitle')
  const nickname = safeString(me?.nickname, t('header.unnamedUser'))
  const avatar = me?.avatarUrl
  const isZh = i18n.language.startsWith('zh')
  function toggleLanguage() {
    void i18n.changeLanguage(isZh ? 'en' : 'zh')
  }

  return (
    <div className="flex h-full max-h-full min-h-0 w-full overflow-hidden">
      <AnimatePresence>
        {sidebarOpen ? (
          <motion.button
            type="button"
            aria-label={t('console.shell.closeMenu')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-black/65 backdrop-blur-[2px] md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(17rem,88vw)] flex-col border-r border-white/[0.08] bg-surface-900/95 shadow-panel backdrop-blur-xl transition-transform duration-200 md:static md:z-0 md:w-60 md:shrink-0 md:translate-x-0 lg:w-64 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div
          className={`flex shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 ${HEADER_H}`}
        >
          <Link
            to="/console/usage"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
            aria-label={t('admin.backToConsole')}
            title={t('admin.backToConsole')}
          >
            <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" />
          </Link>
          <div
            className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-zinc-800/75 to-zinc-900/90 p-1.5 ring-1 ring-inset ring-white/[0.06]"
            aria-hidden
          >
            <img
              src={logoImg}
              alt=""
              className="max-h-[2.65rem] w-auto max-w-full object-contain object-center"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold leading-snug tracking-tight text-white">
              {t('admin.brandTitle')}
            </p>
          </div>
          <button
            type="button"
            className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white md:hidden"
            aria-label={t('console.shell.closeSidebar')}
            onClick={() => setSidebarOpen(false)}
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
          <p className="px-3 pb-1.5 pt-0 text-xs font-medium text-zinc-500">{t('admin.navSection')}</p>
          <div className="flex flex-col gap-1">
            {adminNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'group flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                    isActive
                      ? 'bg-accent/[0.12] text-white shadow-inner shadow-black/20 ring-1 ring-accent/25'
                      : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <FontAwesomeIcon
                      icon={item.icon}
                      className={[
                        'h-3.5 w-3.5 shrink-0 transition-colors duration-200',
                        isActive ? 'text-accent-glow' : 'text-zinc-500 group-hover:text-zinc-300',
                      ].join(' ')}
                    />
                    {t(item.labelKey)}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="shrink-0 border-t border-white/[0.06] p-3">
          <NavLink
            to="/console/profile"
            className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06] transition hover:bg-white/[0.06]"
          >
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-white/10">
              {typeof avatar === 'string' && avatar.length > 0 ? (
                <img
                  src={avatar}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.visibility = 'hidden'
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
                  {meLoading ? '…' : '?'}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-100">
                {meLoading ? t('header.profileLoading') : nickname}
              </p>
              <p className="truncate text-xs text-zinc-500">{t('console.shell.wechatAccount')}</p>
            </div>
          </NavLink>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={toggleLanguage}
              className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-xl border border-white/[0.08] text-zinc-400 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-zinc-200"
              aria-label={isZh ? t('header.switchToEn') : t('header.switchToZh')}
            >
              <FontAwesomeIcon icon={faGlobe} className="h-[1.05rem] w-[1.05rem]" aria-hidden />
            </button>
            <button
              type="button"
              onClick={logout}
              className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] px-1.5 text-sm text-zinc-300 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-200"
            >
              <FontAwesomeIcon icon={faRightFromBracket} className="shrink-0" />
              <span className="truncate">{t('console.shell.logout')}</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className={`flex shrink-0 items-center gap-3 border-b border-white/[0.06] bg-transparent px-4 ${HEADER_H}`}
        >
          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/5 hover:text-white md:hidden"
            aria-label={t('console.shell.openMenu')}
            onClick={() => setSidebarOpen(true)}
          >
            <FontAwesomeIcon icon={faBars} className="h-5 w-5" />
          </button>
          <motion.h1
            key={pageTitle}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-white md:text-lg"
          >
            {pageTitle}
          </motion.h1>
          <div className="flex shrink-0 items-center">{headerRight}</div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children ?? (
            <Outlet context={{ setHeaderRight } satisfies AppShellOutletContext} />
          )}
        </div>
      </div>
    </div>
  )
}
