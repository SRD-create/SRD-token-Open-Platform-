import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLocation, useOutlet } from 'react-router-dom'
import { LandingHeader } from '@/landing/LandingHeader'

const landingBg =
  'pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.22),transparent),radial-gradient(ellipse_50%_40%_at_100%_0%,rgba(39,39,42,0.5),transparent)]'

const easeOut = [0.22, 1, 0.36, 1] as const

/** 与 `index.css` 中根滚动条样式联动，统一 Mac / Windows 落地页视口滚动条外观 */
const LANDING_SCROLL_SURFACE_CLASS = 'landing-scroll-surface'

/** 落地页共用顶栏与背景；子路由切换时主内容区渐入，避免整页硬切 */
function initialHeaderOffsetPx() {
  if (typeof window === 'undefined') return 72
  return window.matchMedia('(min-width: 768px)').matches ? 65 : 112
}

export function LandingLayout() {
  const location = useLocation()
  const outlet = useOutlet()
  const reduceMotion = useReducedMotion()
  const headerRef = useRef<HTMLElement | null>(null)
  const [headerOffsetPx, setHeaderOffsetPx] = useState(initialHeaderOffsetPx)

  /** 文档区 `/docs/*` 共用同一外壳，避免切换子页时整段 remount 导致左侧栏重渲染 */
  const presenceKey = useMemo(
    () => (location.pathname.startsWith('/docs') ? '/docs' : location.pathname),
    [location.pathname],
  )

  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const sync = () => setHeaderOffsetPx(Math.ceil(el.getBoundingClientRect().height))
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    document.documentElement.classList.add(LANDING_SCROLL_SURFACE_CLASS)
    return () => {
      document.documentElement.classList.remove(LANDING_SCROLL_SURFACE_CLASS)
    }
  }, [])

  /** 仅淡入淡出：避免 `translateY` 在 Windows Chrome 上触发布局/滚动条闪动 */
  const instant = reduceMotion ? { opacity: 1 } : { opacity: 0 }
  const exitState = reduceMotion ? { opacity: 1 } : { opacity: 0 }

  return (
    <div
      className="flex h-full w-full min-h-dvh flex-col bg-surface-950 text-zinc-100"
      style={{ ['--landing-header-offset' as string]: `${headerOffsetPx}px` }}
    >
      <div className={landingBg} aria-hidden />
      <LandingHeader ref={headerRef} />
      {/* fixed 顶栏脱离文档流，用实测高度占位，避免被 overflow-x:hidden 祖先拖垮的 sticky */}
      <div className="shrink-0" style={{ height: headerOffsetPx }} aria-hidden />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={presenceKey}
          role="presentation"
          className="relative z-10 flex min-h-0 w-full flex-1 flex-col"
          initial={instant}
          animate={{ opacity: 1 }}
          exit={exitState}
          transition={{
            duration: reduceMotion ? 0 : 0.36,
            ease: easeOut,
          }}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
