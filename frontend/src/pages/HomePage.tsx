import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { animate, motion, useInView } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRight, faChartLine, faLayerGroup, faServer } from '@fortawesome/free-solid-svg-icons'
import { useLandingSession } from '@/landing/LandingSessionContext'
import { useAuth } from '@/auth/useAuth'
import { HomeAuroraBackdrop } from '@/landing/HomeAuroraBackdrop'
import { landingContentShellClass, landingHeroPaddingTopClass } from '@/landing/landingContentShell'

const easeOut = [0.22, 1, 0.36, 1] as const

const fadeUp = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.45, ease: easeOut },
  },
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.06 },
  },
}

const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: easeOut },
  },
}

const staggerInner = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.04 },
  },
}

const viewportOnce = { once: true, margin: '-48px 0px' } as const

const STAT_KEYS = ['tokensMonth', 'users', 'models', 'providers'] as const

/** 统计数字动画目标（展示为 value + suffix） */
const STATS_ANIMATED: Record<(typeof STAT_KEYS)[number], { value: number; suffix: string }> = {
  tokensMonth: { value: 25, suffix: 'T+' },
  users: { value: 5, suffix: 'M+' },
  models: { value: 500, suffix: '+' },
  providers: { value: 60, suffix: '+' },
}

function StatFigure({
  statKey,
  className,
}: {
  statKey: (typeof STAT_KEYS)[number]
  className: string
}) {
  const { value: target, suffix } = STATS_ANIMATED[statKey]
  const ref = useRef<HTMLParagraphElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-12% 0px', amount: 0.3 })
  const [n, setN] = useState(0)
  const [punched, setPunched] = useState(false)

  useEffect(() => {
    if (!isInView) return
    const ctrl = animate(0, target, {
      duration: 1.35,
      ease: easeOut,
      onUpdate: (latest) => setN(Math.min(target, Math.round(latest))),
      onComplete: () => setPunched(true),
    })
    return () => ctrl.stop()
  }, [isInView, target])

  return (
    <motion.p
      ref={ref}
      className={`tabular-nums ${className}`}
      animate={punched ? { scale: [1, 1.07, 1] } : {}}
      transition={{ duration: 0.38, ease: easeOut }}
    >
      {n}
      {suffix}
    </motion.p>
  )
}

const FEATURE_CONFIG = [
  { key: 'selfBuilt' as const, icon: faLayerGroup, link: '/docs/self-built' as const },
  { key: 'hardcore' as const, icon: faServer, link: '/docs/hardcore' as const },
  { key: 'costPerf' as const, icon: faChartLine, link: '/docs/cost-performance' as const },
]

const FEATURE_STYLES: Record<
  (typeof FEATURE_CONFIG)[number]['key'],
  { iconBg: string; linkClass: string }
> = {
  selfBuilt: {
    iconBg: 'bg-sky-500/15 text-sky-400',
    linkClass: 'text-sky-400 hover:text-sky-300',
  },
  hardcore: {
    iconBg: 'bg-accent/15 text-accent-glow',
    linkClass: 'text-accent-glow hover:text-accent',
  },
  costPerf: {
    iconBg: 'bg-emerald-500/15 text-emerald-400',
    linkClass: 'text-emerald-400 hover:text-emerald-300',
  },
}

/** 页脚部分外链暂时统一至公司站点（恢复各独立页时改回各自 href） */
const FOOTER_CORP_EXTERNAL = 'https://your-domain.com/'

const FOOTER_ITEMS: { linkKey: string; href: string }[] = [
  { linkKey: 'support', href: FOOTER_CORP_EXTERNAL },
  { linkKey: 'about', href: FOOTER_CORP_EXTERNAL },
  { linkKey: 'partners', href: FOOTER_CORP_EXTERNAL },
  { linkKey: 'enterprise', href: FOOTER_CORP_EXTERNAL },
  { linkKey: 'careers', href: FOOTER_CORP_EXTERNAL },
  { linkKey: 'pricing', href: '/console/plans' },
  { linkKey: 'privacyTerms', href: '/docs/privacy' },
]

const STEP_IDS = ['1', '2', '3'] as const

export function HomePage() {
  const { t } = useTranslation()
  const { token } = useAuth()
  const { openLogin } = useLandingSession()

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <main className="relative z-10 isolate">
      <HomeAuroraBackdrop />
      <div className="relative z-[1]">
        <section>
          <div className={landingContentShellClass}>
            <div
              className={`mx-auto max-w-4xl pb-16 text-center md:pb-20 ${landingHeroPaddingTopClass}`}
            >
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="flex flex-col items-center"
          >
            <motion.h1
              variants={staggerItem}
              className="text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl md:text-5xl md:leading-[1.15]"
            >
              {t('home.hero.titleBefore')}
              <br className="sm:hidden" />
              <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-accent bg-clip-text text-transparent">
                {' '}
                {t('home.hero.titleHighlight')}
              </span>
            </motion.h1>
            <motion.p
              variants={staggerItem}
              className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-zinc-400 md:text-lg"
            >
              {t('home.hero.subtitle')}
            </motion.p>
            <motion.div
              variants={staggerItem}
              className="mt-10 flex w-full max-w-lg flex-row items-stretch justify-center gap-2 sm:max-w-none sm:gap-3"
            >
              {token ? (
                <Link
                  to="/console/api-keys"
                  className="inline-flex min-w-0 flex-1 items-center justify-center rounded-full bg-white px-3 py-2.5 text-xs font-semibold text-black shadow-none transition-[background-color,color,box-shadow] duration-300 hover:bg-accent hover:text-white hover:shadow-glow sm:flex-initial sm:px-8 sm:py-3 sm:text-sm"
                >
                  {t('home.cta.getApiKey')}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => openLogin({ redirectTo: '/console/api-keys' })}
                  className="inline-flex min-w-0 flex-1 items-center justify-center rounded-full bg-white px-3 py-2.5 text-xs font-semibold text-black shadow-none transition-[background-color,color,box-shadow] duration-300 hover:bg-accent hover:text-white hover:shadow-glow sm:flex-initial sm:px-8 sm:py-3 sm:text-sm"
                >
                  {t('home.cta.getApiKey')}
                </button>
              )}
              <Link
                to="/models"
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-white/[0.14] bg-white/[0.03] px-3 py-2.5 text-xs font-medium text-zinc-200 transition hover:border-white/25 hover:bg-white/[0.06] sm:flex-initial sm:gap-3 sm:px-8 sm:py-3 sm:text-sm"
              >
                {t('home.cta.exploreModels')}
                <span className="flex items-center gap-0.5" aria-hidden>
                  <span className="home-cta-dot-bounce inline-block h-2 w-2 rounded-full bg-sky-500/70" />
                  <span className="home-cta-dot-bounce home-cta-dot-bounce-delay-1 inline-block h-2 w-2 rounded-full bg-accent/70" />
                  <span className="home-cta-dot-bounce home-cta-dot-bounce-delay-2 inline-block h-2 w-2 rounded-full bg-emerald-500/70" />
                </span>
              </Link>
            </motion.div>
          </motion.div>
            </div>
          </div>
        </section>

        <motion.section
          className="border-y border-white/[0.06] bg-surface-900/40 py-12 backdrop-blur-sm"
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer}
        >
          <div className={landingContentShellClass}>
            <div className="grid w-full grid-cols-2 gap-8 md:grid-cols-4 md:gap-4">
            {STAT_KEYS.map((key) => (
              <motion.div key={key} variants={staggerItem} className="text-center">
                <StatFigure
                  statKey={key}
                  className={`text-2xl font-bold tracking-tight md:text-3xl ${
                    key === 'models' ? 'text-accent-glow' : 'text-white'
                  }`}
                />
                <p className="mt-1 text-[10px] font-medium tracking-wide text-zinc-500 md:text-xs">
                  {t(`home.stats.${key}`)}
                </p>
              </motion.div>
            ))}
            </div>
          </div>
        </motion.section>

        <motion.section
          id="features"
          className="scroll-mt-20 py-16 md:py-20"
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer}
        >
          <div className={landingContentShellClass}>
            <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_CONFIG.map((f) => {
              const st = FEATURE_STYLES[f.key]
              const title = t(`home.features.${f.key}.title`)
              return (
                <motion.div
                  key={f.key}
                  variants={staggerItem}
                  className="group flex flex-col rounded-2xl border border-white/[0.08] bg-surface-850/60 p-5 shadow-panel transition-[border-color,box-shadow] duration-300 hover:border-accent/30 hover:shadow-[0_0_40px_-16px_rgba(139,92,246,0.35)]"
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${st.iconBg}`}
                  >
                    <FontAwesomeIcon icon={f.icon} className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-500">
                    {t(`home.features.${f.key}.desc`)}
                  </p>
                  {f.link.startsWith('/') ? (
                    <Link
                      to={f.link}
                      className={`mt-4 inline-flex items-center gap-1 text-sm font-medium ${st.linkClass}`}
                    >
                      {t('home.features.learnMore')}
                      <FontAwesomeIcon icon={faArrowRight} className="h-3 w-3" />
                    </Link>
                  ) : (
                    <a
                      href={f.link}
                      className={`mt-4 inline-flex items-center gap-1 text-sm font-medium ${st.linkClass}`}
                    >
                      {t('home.features.learnMore')}
                      <FontAwesomeIcon icon={faArrowRight} className="h-3 w-3" />
                    </a>
                  )}
                </motion.div>
              )
            })}
            </div>
          </div>
        </motion.section>

        <motion.section
          id="start"
          className="scroll-mt-20 border-t border-white/[0.06] bg-surface-900/30 pb-8 pt-16 md:pb-10 md:pt-20"
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={staggerContainer}
        >
          <div className={landingContentShellClass}>
          <motion.div variants={staggerItem} className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-semibold text-white md:text-3xl">{t('home.start.title')}</h2>
            <p className="mt-2 text-sm text-zinc-500 md:text-base">{t('home.start.subtitle')}</p>
          </motion.div>
          <motion.div
            variants={staggerInner}
            className="relative mx-auto mt-14 max-w-4xl px-2"
          >
            <div className="absolute left-[12%] right-[12%] top-5 hidden h-px bg-white/10 md:block" aria-hidden />
            <div className="grid gap-10 md:grid-cols-3 md:gap-6">
              {STEP_IDS.map((sid) => (
                <motion.div
                  key={sid}
                  variants={staggerItem}
                  className="relative flex flex-col items-center text-center"
                >
                  <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.1] bg-surface-850 text-sm font-bold text-white ring-4 ring-surface-950">
                    {sid}
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-white">
                    {t(`home.steps.${sid}.title`)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                    {t(`home.steps.${sid}.desc`)}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
          </div>
        </motion.section>

        <motion.footer
          id="contact"
          className="scroll-mt-20 border-t border-white/[0.06] bg-surface-950/90 py-5"
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
        >
          <div className={landingContentShellClass}>
          <div className="flex w-full flex-col items-center gap-4 text-center md:flex-row md:items-start md:justify-between md:text-left">
            <div className="max-w-full px-1">
              <p className="text-xs leading-relaxed text-zinc-500">{t('home.footer.copyright')}</p>
            </div>
            <nav className="flex max-w-full flex-wrap justify-center gap-x-4 gap-y-2 md:justify-end">
              {FOOTER_ITEMS.map(({ linkKey, href }) =>
                href.startsWith('/') ? (
                  <Link
                    key={linkKey}
                    to={href}
                    className="text-xs text-zinc-500 transition hover:text-zinc-300"
                  >
                    {t(`footer.links.${linkKey}`)}
                  </Link>
                ) : (
                  <a
                    key={linkKey}
                    href={href}
                    className="text-xs text-zinc-500 transition hover:text-zinc-300"
                    {...(href.startsWith('http')
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                  >
                    {t(`footer.links.${linkKey}`)}
                  </a>
                ),
              )}
            </nav>
          </div>
          </div>
        </motion.footer>
      </div>
    </main>
  )
}
