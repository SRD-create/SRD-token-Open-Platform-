import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { useCallback, useLayoutEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChartLine,
  faFileLines,
  faHandshake,
  faLayerGroup,
  faLock,
  faServer,
} from '@fortawesome/free-solid-svg-icons'
import { scrollDocsMainToTop } from '@/lib/scrollDocsMain'
import {
  docsMainReadingColumnClass,
  landingContentShellClass,
  landingModelSquarePaddingTopClass,
} from '@/landing/landingContentShell'

const DOC_NAV: { to: string; end?: boolean; labelKey: string; icon: IconDefinition }[] = [
  { to: '/docs', end: true, labelKey: 'docsLayout.navApiDocs', icon: faFileLines },
  { to: '/docs/self-built', labelKey: 'docsLayout.navFeatureSelfBuilt', icon: faLayerGroup },
  { to: '/docs/hardcore', labelKey: 'docsLayout.navFeatureHardcore', icon: faServer },
  { to: '/docs/cost-performance', labelKey: 'docsLayout.navFeatureCostPerf', icon: faChartLine },
  { to: '/docs/partner-rules', labelKey: 'docsLayout.navPartnerRules', icon: faHandshake },
  { to: '/docs/privacy', labelKey: 'docsLayout.navPrivacy', icon: faLock },
]

const docContentEase = [0.22, 1, 0.36, 1] as const

const DOCS_VIEWPORT_LOCK_CLASS = 'docs-viewport-lock'

/**
 * 文档区：外层与「联系我们」等内容页同一水平边距（`landingContentShellClass`）；
 * 左侧模块导航 + 右侧 `#docs-main` 纵向滚动；内层 `docsMainReadingColumnClass` 限制正文最大宽度。
 */
export function DocsLayout() {
  const { t } = useTranslation()
  const location = useLocation()
  const reduceMotion = useReducedMotion()

  const scrollDocsToTop = useCallback(() => {
    scrollDocsMainToTop()
  }, [])

  /** Windows：禁止整页滚动，仅 `#docs-main` 接收滚轮；卸载时恢复 */
  useLayoutEffect(() => {
    document.documentElement.classList.add(DOCS_VIEWPORT_LOCK_CLASS)
    return () => {
      document.documentElement.classList.remove(DOCS_VIEWPORT_LOCK_CLASS)
    }
  }, [])

  /** 子路由切换时置顶右侧滚动区；双帧兜底 API 文档异步布局 */
  useLayoutEffect(() => {
    let raf1 = 0
    let raf2 = 0
    scrollDocsToTop()
    raf1 = requestAnimationFrame(() => {
      scrollDocsToTop()
      raf2 = requestAnimationFrame(() => {
        scrollDocsToTop()
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [location.pathname, location.key, scrollDocsToTop])

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'group flex min-h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-0 text-left text-sm font-medium transition md:min-h-14 md:w-full md:flex-none',
      isActive
        ? 'border border-accent/40 bg-accent/[0.14] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-accent/25'
        : 'border border-transparent text-zinc-400 hover:border-white/[0.1] hover:bg-white/[0.05] hover:text-zinc-100',
    ].join(' ')

  return (
    <div
      className={`${landingContentShellClass} ${landingModelSquarePaddingTopClass} relative z-10 flex h-full min-h-0 w-full flex-1 flex-col overflow-x-clip overflow-y-hidden md:flex-row md:items-stretch md:gap-6 lg:gap-8`}
    >
      <aside className="scrollbar-surface z-20 w-full shrink-0 border-b border-white/[0.08] bg-transparent md:flex md:h-full md:min-h-0 md:w-56 md:shrink-0 md:flex-col md:overflow-y-auto md:overscroll-y-contain md:border-b-0 md:border-r md:border-white/[0.08] md:pr-px [color-scheme:dark] lg:w-60">
        <nav
          className="flex gap-1.5 overflow-x-auto px-2.5 pb-2.5 pt-0 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-col md:gap-3 md:px-3 md:pb-3 md:pt-0 [&::-webkit-scrollbar]:hidden"
          aria-label={t('docsLayout.moduleNavAria')}
        >
          {DOC_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              className={navLinkClass}
              onClick={scrollDocsToTop}
            >
              {({ isActive }) => (
                <>
                  <span
                    className={[
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition md:h-10 md:w-10',
                      isActive
                        ? 'bg-transparent text-accent-glow ring-0'
                        : 'bg-white/[0.06] text-zinc-400 ring-1 ring-white/[0.06] group-hover:bg-white/[0.1] group-hover:text-zinc-200',
                    ].join(' ')}
                  >
                    <FontAwesomeIcon icon={item.icon} className="h-3 w-3 md:h-4 md:w-4" aria-hidden />
                  </span>
                  <span className="flex min-h-7 min-w-0 flex-1 items-center leading-snug md:min-h-0">
                    <span className={`block truncate ${isActive ? 'text-zinc-50' : ''}`}>
                      {t(item.labelKey)}
                    </span>
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main
        id="docs-main"
        className="scrollbar-surface min-h-0 w-full min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-clip overscroll-y-contain [-webkit-overflow-scrolling:touch] [color-scheme:dark] [scrollbar-gutter:stable]"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            className="min-h-0 min-w-0"
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.26,
              ease: docContentEase,
            }}
            onAnimationComplete={scrollDocsToTop}
          >
            <div className={docsMainReadingColumnClass}>
              <Outlet />
            </div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
