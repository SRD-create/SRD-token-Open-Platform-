import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PartnerJoinModal } from '@/components/PartnerJoinModal'
import { useAuth } from '@/auth/useAuth'
import { useLandingSession } from '@/landing/LandingSessionContext'
import {
  PARTNER_JOIN_OPEN_AFTER_LOGIN_KEY,
  PARTNER_JOIN_PENDING_KEY,
  PARTNER_JOIN_TIER_ID_KEY,
  PARTNER_JOIN_TIER_YUAN_KEY,
} from '@/landing/partnerJoinPending'
import {
  PARTNER_JOIN_FALLBACK_AMOUNTS,
  defaultPartnerJoinAmount,
  isPartnerJoinAmount,
  isPartnerJoinLevelId,
  tierMatchesMeAgentLevel,
} from '@/lib/partnerJoinTiers'
import { listAgentLevels } from '@/api/nexus/agents'
import { mapAgentPackageItem, type AgentPackageCardRow } from '@/api/mappers/agentPackage'
import { isJoinedAgentFromMe } from '@/api/mappers/me'
import { PartnerDiscountStamp } from '@/components/PartnerDiscountStamp'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBolt,
  faBriefcase,
  faBullseye,
  faCircleCheck,
  faCheck,
  faChartLine,
  faChevronDown,
  faClock,
  faGem,
  faGraduationCap,
  faMobileScreen,
  faPlay,
  faStar,
  faUsers,
} from '@fortawesome/free-solid-svg-icons'
import { landingContentShellClass } from '@/landing/landingContentShell'

const pageWrap = landingContentShellClass

/** 三档卡片折扣章统一为「五折」（与 `PartnerDiscountStamp` 内直减 50% 换算一致） */
const PARTNER_TIER_STAMP_OFF_UNIFIED = 50

/** 接口不可用或缺档时，标题 / 价格 / 返佣三处展示占位符 */
const TIER_FIELD_PLACEHOLDER = '-'

/** 加盟费展示：后端 `price` 为折后价，原价 = 折后价 / (1 - 折扣比例) */
function formatPartnerTierYuan(yuan: number): string {
  return Math.abs(yuan - Math.round(yuan)) < 1e-9
    ? String(Math.round(yuan))
    : yuan.toFixed(2).replace(/\.?0+$/, '')
}

function partnerTierOriginalYuan(discountedYuan: number, offPercent: number): number {
  const off = Math.min(99, Math.max(0, offPercent))
  const denom = 1 - off / 100
  if (denom <= 0) return discountedYuan
  return discountedYuan / denom
}

/** 三档卡片底部说明：与 `displayTierRows` 左→右顺序一致（低→中→高） */
const TIER_CARD_FOOTNOTE_I18N_KEYS = [
  'tierCardFootnotesStart',
  'tierCardFootnotesGrowth',
  'tierCardFootnotesPro',
] as const

function partnerPlaceholderTier(level: number, slotIndex: number): AgentPackageCardRow {
  return {
    id: -1000 - slotIndex,
    level,
    name: TIER_FIELD_PLACEHOLDER,
    priceYuan: 0,
    rebatePercent: 0,
    rebatePercentLabel: TIER_FIELD_PLACEHOLDER,
    discountOffPercent: null,
    isUnavailable: true,
  }
}

/** 始终渲染三档：接口有则取前三档（按 level 等排序），不足补占位 */
function partnerDisplayThreeTiers(api: AgentPackageCardRow[]): AgentPackageCardRow[] {
  const sorted = [...api].sort(
    (a, b) => a.level - b.level || a.priceYuan - b.priceYuan || a.id - b.id,
  )
  const top = sorted.slice(0, 3)
  const out: AgentPackageCardRow[] = []
  for (let i = 0; i < 3; i++) {
    out.push(top[i] ?? partnerPlaceholderTier(i + 1, i))
  }
  return out
}

/** 可发起加盟的档位，低 level 优先；金额相同时顺序稳定 */
function sortedJoinableAgentRows(rows: AgentPackageCardRow[]): AgentPackageCardRow[] {
  return [...rows]
    .filter((r) => !r.isUnavailable && r.priceYuan > 0)
    .sort((a, b) => a.level - b.level || a.id - b.id)
}

const tierSkBar = 'animate-skeleton rounded-md bg-white/[0.09]'

/** 加盟三档卡片加载占位（布局与正式卡片一致） */
function PartnerJoinTierCardsSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => {
        const featured = i === 2
        return (
          <div
            key={i}
            aria-hidden
            className={[
              'relative flex min-h-[25rem] flex-col overflow-hidden rounded-2xl border text-left backdrop-blur-md sm:min-h-[26rem]',
              featured
                ? 'border-sky-400/40 bg-gradient-to-b from-sky-500/[0.12] via-white/[0.05] to-violet-600/[0.08]'
                : 'border-white/[0.1] bg-gradient-to-b from-white/[0.08] to-white/[0.02]',
            ].join(' ')}
          >
            {featured ? (
              <div className="absolute left-1/2 top-0 z-[2] flex -translate-x-1/2 -translate-y-1/2 justify-center px-1">
                <div className={`h-7 w-[5.5rem] rounded-full ${tierSkBar}`} />
              </div>
            ) : null}
            <div
              className={`pointer-events-none absolute left-2 top-2 z-[1] h-14 w-14 rounded-full border border-white/[0.08] sm:left-2 sm:top-2 ${tierSkBar}`}
            />
            <div className="relative flex flex-1 flex-col px-4 pb-5 pt-6 sm:px-4 sm:pb-5 sm:pt-6">
              <div className={`mx-auto h-4 w-[7rem] ${tierSkBar}`} />
              <div className={`mx-auto mt-4 h-4 w-16 ${tierSkBar}`} />
              <div className={`mx-auto mt-2 h-11 w-[8.5rem] sm:h-12 sm:w-36 ${tierSkBar}`} />
              <div className={`mx-auto mt-4 h-6 w-44 max-w-full ${tierSkBar}`} />
              <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-sky-400/25 to-transparent" />
              <ul className="mt-4 space-y-2.5">
                <li className="flex items-center gap-2">
                  <div className={`h-4 w-4 shrink-0 rounded ${tierSkBar}`} />
                  <div className={`h-3.5 min-w-0 flex-1 ${tierSkBar}`} />
                </li>
                <li className="flex items-center gap-2">
                  <div className={`h-4 w-4 shrink-0 rounded ${tierSkBar}`} />
                  <div className={`h-3.5 min-w-0 w-[92%] max-w-full ${tierSkBar}`} />
                </li>
                <li className="flex items-center gap-2">
                  <div className={`h-4 w-4 shrink-0 rounded ${tierSkBar}`} />
                  <div className={`h-3.5 min-w-0 w-[78%] max-w-full ${tierSkBar}`} />
                </li>
              </ul>
              <div className={`mt-auto h-10 w-full shrink-0 rounded-xl ${tierSkBar}`} />
            </div>
          </div>
        )
      })}
    </>
  )
}

/** 公开「代理加盟」介绍页，路由：/partners */
export function PartnersPage() {
  const { t } = useTranslation()
  const { token, me } = useAuth()
  const { openLogin } = useLandingSession()
  const [joinModalOpen, setJoinModalOpen] = useState(false)
  /** 当前选中的加盟套餐：`GET /agents/levels` 条目的 `id`，与 `agent_level_id` 一致（不用价格作键，避免同价多档歧义） */
  const [joinAgentLevelId, setJoinAgentLevelId] = useState(0)
  const [agentRows, setAgentRows] = useState<AgentPackageCardRow[]>([])
  const [agentPackagesLoading, setAgentPackagesLoading] = useState(true)

  const displayTierRows = useMemo(() => partnerDisplayThreeTiers(agentRows), [agentRows])

  const allowedJoinAmounts = useMemo(
    () => agentRows.filter((r) => !r.isUnavailable && r.priceYuan > 0).map((r) => r.priceYuan),
    [agentRows],
  )
  const allowedAgentLevelIds = useMemo(
    () => agentRows.filter((r) => !r.isUnavailable && r.id > 0).map((r) => r.id),
    [agentRows],
  )
  const selectedAgentRow = useMemo(() => {
    if (joinAgentLevelId <= 0) return null
    return agentRows.find((r) => r.id === joinAgentLevelId) ?? null
  }, [agentRows, joinAgentLevelId])
  const joinFeeYuanForModal = selectedAgentRow?.priceYuan ?? PARTNER_JOIN_FALLBACK_AMOUNTS[0]!
  const agentLevelIdForModal = joinAgentLevelId
  const maxAgentLevel = useMemo(() => {
    const real = displayTierRows.filter((r) => !r.isUnavailable)
    return real.length ? Math.max(...real.map((r) => r.level)) : 0
  }, [displayTierRows])
  const tierCardFootnoteLists = useMemo(
    () =>
      TIER_CARD_FOOTNOTE_I18N_KEYS.map((suffix) => {
        const v = t(`partners.hero.${suffix}`, { returnObjects: true })
        return Array.isArray(v) ? (v as string[]) : []
      }),
    [t],
  )

  const loadAgentPackages = useCallback(async () => {
    setAgentPackagesLoading(true)
    try {
      const { items } = await listAgentLevels()
      const rows = items
        .map((it) => mapAgentPackageItem(it))
        .filter((r): r is AgentPackageCardRow => r != null)
      rows.sort((a, b) => a.level - b.level || a.priceYuan - b.priceYuan || a.id - b.id)
      setAgentRows(rows)
    } catch {
      setAgentRows([])
    } finally {
      setAgentPackagesLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAgentPackages()
  }, [loadAgentPackages])

  useEffect(() => {
    setJoinAgentLevelId((prev) => {
      const joinable = sortedJoinableAgentRows(agentRows)
      if (joinable.length === 0) {
        return 0
      }
      const meLevel = me?.agentLevel
      const unowned = () =>
        typeof meLevel === 'number' && meLevel > 0
          ? joinable.find((r) => !tierMatchesMeAgentLevel(r, meLevel))?.id
          : undefined
      if (prev > 0) {
        const current = joinable.find((r) => r.id === prev)
        if (current) {
          if (typeof meLevel === 'number' && meLevel > 0 && tierMatchesMeAgentLevel(current, meLevel)) {
            const n = unowned()
            return n != null ? n : joinable[0]!.id
          }
          return prev
        }
      }
      const u = unowned()
      return u != null ? u : joinable[0]!.id
    })
  }, [agentRows, me?.agentLevel])

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  /**
   * 登录后打开加盟弹窗：整页 OAuth 保留 {@link PARTNER_JOIN_PENDING_KEY}；
   * 弹窗登录由 `afterAuth` 写入 {@link PARTNER_JOIN_OPEN_AFTER_LOGIN_KEY}。
   */
  useEffect(() => {
    if (!token) return
    try {
      const oauthPending = sessionStorage.getItem(PARTNER_JOIN_PENDING_KEY) === '1'
      const afterModalLogin = sessionStorage.getItem(PARTNER_JOIN_OPEN_AFTER_LOGIN_KEY) === '1'
      if (!oauthPending && !afterModalLogin) return
      if (oauthPending) sessionStorage.removeItem(PARTNER_JOIN_PENDING_KEY)
      if (afterModalLogin) sessionStorage.removeItem(PARTNER_JOIN_OPEN_AFTER_LOGIN_KEY)

      const rawId = sessionStorage.getItem(PARTNER_JOIN_TIER_ID_KEY)
      sessionStorage.removeItem(PARTNER_JOIN_TIER_ID_KEY)
      const rawYuan = sessionStorage.getItem(PARTNER_JOIN_TIER_YUAN_KEY)
      sessionStorage.removeItem(PARTNER_JOIN_TIER_YUAN_KEY)

      const joinable = sortedJoinableAgentRows(agentRows)
      if (joinable.length === 0) return

      const meLevel = me?.agentLevel
      const toUnownedIfNeeded = (id: number) => {
        const row = joinable.find((r) => r.id === id)
        if (!row) return null
        if (typeof meLevel === 'number' && meLevel > 0 && tierMatchesMeAgentLevel(row, meLevel)) {
          return joinable.find((r) => !tierMatchesMeAgentLevel(r, meLevel))?.id ?? null
        }
        return id
      }

      const parsedId = rawId != null ? Number.parseInt(rawId, 10) : NaN
      let chosen: number | null = null
      if (Number.isFinite(parsedId) && isPartnerJoinLevelId(parsedId, allowedAgentLevelIds)) {
        chosen = toUnownedIfNeeded(parsedId)
      } else {
        const n = rawYuan != null ? Number.parseFloat(String(rawYuan)) : NaN
        if (Number.isFinite(n) && isPartnerJoinAmount(n, allowedJoinAmounts)) {
          const byPrice = joinable.filter((r) => r.priceYuan === n)
          if (byPrice.length === 1) {
            chosen = toUnownedIfNeeded(byPrice[0]!.id)
          } else if (byPrice.length > 1) {
            chosen = toUnownedIfNeeded(
              (typeof meLevel === 'number' && meLevel > 0
                ? byPrice.find((r) => !tierMatchesMeAgentLevel(r, meLevel)) ?? byPrice[0]
                : byPrice[0]
              )!.id,
            )
          }
        }
        if (chosen == null) {
          const y = defaultPartnerJoinAmount(allowedJoinAmounts)
          const byDefault = joinable.find((r) => r.priceYuan === y) ?? joinable[0]!
          chosen = toUnownedIfNeeded(byDefault.id)
        }
      }
      if (chosen == null) return
      setJoinAgentLevelId(chosen)
      setJoinModalOpen(true)
    } catch {
      /* ignore */
    }
  }, [token, allowedJoinAmounts, allowedAgentLevelIds, agentRows, me?.agentLevel])

  const [faqOpen, setFaqOpen] = useState<number | null>(0)

  function onJoinClick(tier: AgentPackageCardRow) {
    if (tier.isUnavailable || tier.priceYuan <= 0) return
    const meLevel = me?.agentLevel
    if (typeof meLevel === 'number' && meLevel > 0 && tierMatchesMeAgentLevel(tier, meLevel)) return
    if (!token) {
      try {
        sessionStorage.setItem(PARTNER_JOIN_TIER_ID_KEY, String(tier.id))
        sessionStorage.setItem(PARTNER_JOIN_TIER_YUAN_KEY, String(tier.priceYuan))
      } catch {
        /* ignore */
      }
      openLogin({
        redirectTo: '/partners',
        afterAuth: () => {
          try {
            sessionStorage.setItem(PARTNER_JOIN_OPEN_AFTER_LOGIN_KEY, '1')
          } catch {
            /* ignore */
          }
        },
      })
      return
    }
    setJoinAgentLevelId(tier.id)
    setJoinModalOpen(true)
  }

  const joinReasonCards = [
    { key: 'r1', icon: faGem },
    { key: 'r2', icon: faBullseye },
    { key: 'r3', icon: faStar },
    { key: 'r4', icon: faCircleCheck },
  ] as const

  const audienceCards = [
    { key: 'c1', icon: faGraduationCap, iconClass: 'bg-sky-500 text-white shadow-lg shadow-sky-900/40' },
    { key: 'c2', icon: faMobileScreen, iconClass: 'bg-pink-500 text-white shadow-lg shadow-pink-900/40' },
    { key: 'c3', icon: faBriefcase, iconClass: 'bg-violet-500 text-white shadow-lg shadow-violet-900/40' },
    { key: 'c4', icon: faPlay, iconClass: 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-900/30' },
  ] as const

  const traitCards = [
    { key: 't1', icon: faChartLine, ring: 'ring-sky-500/25' },
    { key: 't2', icon: faUsers, ring: 'ring-violet-500/25' },
    { key: 't3', icon: faStar, ring: 'ring-pink-500/25' },
    { key: 't4', icon: faClock, ring: 'ring-amber-400/25' },
  ] as const

  const faqItems = [
    { q: t('partners.why.q1'), a: t('partners.why.a1') },
    { q: t('partners.why.q2'), a: t('partners.why.a2') },
    { q: t('partners.why.q3'), a: t('partners.why.a3') },
    { q: t('partners.why.q4'), a: t('partners.why.a4') },
  ]

  return (
    <main className="relative z-10 min-h-0 flex-1">
      <PartnerJoinModal
        open={joinModalOpen}
        joinFeeYuan={joinFeeYuanForModal}
        agentLevelId={agentLevelIdForModal}
        allowedAgentLevelIds={allowedAgentLevelIds}
        onClose={() => setJoinModalOpen(false)}
      />
        <section className={`${pageWrap} pb-16 pt-10 md:pb-20 md:pt-14`}>
          <div className="mx-auto w-full max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-[2.65rem] md:leading-[1.15]">
                {t('partners.hero.titleBefore')}
                <span className="bg-gradient-to-r from-sky-400 via-blue-500 to-violet-500 bg-clip-text text-transparent">
                  {t('partners.hero.titleGradient')}
                </span>
              </h1>
              <p className="mt-4 text-base text-zinc-400 md:text-lg">{t('partners.hero.subtitle')}</p>
            </div>

            <div className="mx-auto mt-8 w-full max-w-5xl">
              <div
                className="rounded-2xl border border-white/[0.1] bg-gradient-to-b from-surface-850/92 to-surface-900/85 p-4 shadow-[0_22px_60px_-30px_rgba(56,189,248,0.2)] sm:p-5 md:p-6"
                role="status"
              >
                <h3 className="text-xl font-bold text-sky-400 md:text-2xl">
                  {t('partners.hero.whyFeeTitle')}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-300 md:text-base">
                  {t('partners.hero.whyFeeDesc')}
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {joinReasonCards.map(({ key, icon }) => (
                    <article
                      key={key}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30">
                          <FontAwesomeIcon icon={icon} className="h-3.5 w-3.5" />
                        </span>
                        <p className="text-sm font-semibold text-zinc-100">
                          {t(`partners.hero.${key}Title` as 'partners.hero.r1Title')}
                        </p>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                        {t(`partners.hero.${key}Desc` as 'partners.hero.r1Desc')}
                      </p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="mt-12 flex w-full flex-col items-center gap-1.5 md:mt-14" role="status">
                <div className="flex w-full flex-col items-center gap-1">
                  <p className="text-center text-xs font-medium text-zinc-400 sm:text-sm md:text-base lg:text-left">
                    {t('partners.hero.joinFeeTagline')}
                  </p>
                </div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="relative mt-2 w-full overflow-hidden rounded-xl border border-amber-300/45 bg-gradient-to-r from-amber-500/18 via-fuchsia-500/18 to-sky-500/18 px-3 py-2.5 shadow-[0_0_0_1px_rgba(251,191,36,0.22),0_12px_42px_-16px_rgba(251,191,36,0.65)]"
                >
                  <motion.div
                    className="pointer-events-none absolute top-0 h-full w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent opacity-70"
                    initial={{ x: '-140%' }}
                    animate={{ x: '420%' }}
                    transition={{ duration: 2.1, repeat: Infinity, ease: 'linear' }}
                    aria-hidden
                  />
                  <div className="relative flex items-center justify-center gap-2 text-center">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-200/60 bg-amber-300/18 text-amber-100 shadow-[0_0_18px_rgba(250,204,21,0.45)]">
                      <FontAwesomeIcon icon={faBolt} className="h-3.5 w-3.5" />
                    </span>
                    <div className="leading-tight">
                      <p className="text-sm font-extrabold tracking-wide text-amber-100 sm:text-base">
                        {t('partners.hero.limitedTime')}
                      </p>
                      <p className="text-[11px] font-medium text-zinc-100/90 sm:text-xs">
                        {t('partners.hero.limitedTimeDesc')}
                      </p>
                    </div>
                  </div>
                </motion.div>
                <div className="relative mt-1.5 w-full sm:mt-2">
                  <div
                    className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-gradient-to-r from-sky-500/20 via-violet-500/15 to-fuchsia-500/20 blur-2xl sm:-inset-10 sm:blur-3xl"
                    aria-hidden
                  />
                  <div
                    className="relative grid grid-cols-1 gap-4 pt-2.5 sm:grid-cols-3 sm:gap-3 sm:pt-3.5 md:gap-4"
                    aria-busy={agentPackagesLoading}
                    aria-label={agentPackagesLoading ? t('console.common.loading') : undefined}
                  >
                    {agentPackagesLoading ? (
                      <PartnerJoinTierCardsSkeleton />
                    ) : (
                      displayTierRows.map((tier, i) => {
                        const unavailable = tier.isUnavailable === true
                        const meAgentLevel = isJoinedAgentFromMe(me) ? me.agentLevel : null
                        const tierOwned =
                          Boolean(token) &&
                          meAgentLevel != null &&
                          tierMatchesMeAgentLevel(tier, meAgentLevel)
                        const featured = maxAgentLevel > 0 && tier.level === maxAgentLevel
                        const stampOff = Math.round(
                          tier.discountOffPercent ?? PARTNER_TIER_STAMP_OFF_UNIFIED,
                        )
                        const amountStr = unavailable
                          ? TIER_FIELD_PLACEHOLDER
                          : formatPartnerTierYuan(tier.priceYuan)
                        const originalYuan = unavailable
                          ? 0
                          : partnerTierOriginalYuan(tier.priceYuan, stampOff)
                        const originalAmountStr = unavailable
                          ? TIER_FIELD_PLACEHOLDER
                          : formatPartnerTierYuan(originalYuan)
                        return (
                        <motion.div
                          key={tier.id}
                          initial={{ opacity: 0, y: 22 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.5,
                            delay: 0.07 * i,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          whileHover={
                            unavailable || tierOwned
                              ? undefined
                              : {
                                  y: -6,
                                  transition: { duration: 0.22, ease: 'easeOut' },
                                }
                          }
                          className={[
                            'group relative flex min-h-[25rem] flex-col overflow-visible rounded-2xl border text-left backdrop-blur-md transition-[box-shadow,border-color] duration-300 sm:min-h-[26rem]',
                            featured
                              ? 'border-sky-400/50 bg-gradient-to-b from-sky-500/[0.18] via-white/[0.06] to-violet-600/[0.12] shadow-[0_0_0_1px_rgba(56,189,248,0.15),0_24px_60px_-20px_rgba(56,189,248,0.55),0_0_80px_-30px_rgba(139,92,246,0.35)]'
                              : 'border-white/[0.1] bg-gradient-to-b from-white/[0.09] to-white/[0.02] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:border-sky-400/35 hover:shadow-[0_20px_50px_-28px_rgba(56,189,248,0.4)]',
                          ].join(' ')}
                        >
                          <div
                            className="pointer-events-none absolute inset-0 opacity-80 transition-opacity duration-300 group-hover:opacity-100"
                            aria-hidden
                          >
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-30%,rgba(56,189,248,0.22),transparent_58%)]" />
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_100%_100%,rgba(139,92,246,0.12),transparent_50%)]" />
                          </div>
                          {featured ? (
                            <div className="absolute left-1/2 top-0 z-[2] flex -translate-x-1/2 -translate-y-1/2 justify-center px-1">
                              <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-white/25 bg-gradient-to-r from-sky-500 to-violet-600 px-3 py-1.5 text-xs font-bold leading-none tracking-wide text-white shadow-[0_6px_20px_-4px_rgba(59,130,246,0.75)] sm:uppercase sm:tracking-widest">
                                {t('partners.hero.joinFeeRecommended')}
                              </span>
                            </div>
                          ) : null}
                          <div className="pointer-events-none absolute left-1.5 top-1.5 z-[3] sm:left-2 sm:top-2">
                            <PartnerDiscountStamp offPercent={stampOff} />
                          </div>
                          <div
                            className="relative flex flex-1 flex-col px-4 pb-5 pt-6 sm:px-4 sm:pb-5 sm:pt-6"
                          >
                            <p className="text-center text-sm font-bold tracking-wide text-sky-300 sm:text-base">
                              {unavailable ? TIER_FIELD_PLACEHOLDER : tier.name}
                            </p>
                            <div className="mt-3 flex flex-col items-center justify-center gap-0.5">
                              {!unavailable ? (
                                <p
                                  className="flex flex-wrap items-baseline justify-center gap-x-1.5 text-center text-sm font-medium leading-tight text-zinc-500 sm:text-base"
                                  aria-label={t('partners.hero.joinFeeOriginalAria', {
                                    price: t('partners.hero.joinFeeTierAmount', { amount: originalAmountStr }),
                                  })}
                                >
                                  <span className="shrink-0">{t('partners.hero.joinFeeOriginalLabel')}</span>
                                  <span className="tabular-nums line-through decoration-zinc-500/70 decoration-1">
                                    {t('partners.hero.joinFeeTierAmount', { amount: originalAmountStr })}
                                  </span>
                                </p>
                              ) : null}
                              <p
                                className={[
                                  'text-center text-[2rem] font-black tabular-nums leading-none tracking-tight sm:text-[2.35rem]',
                                  unavailable
                                    ? 'text-zinc-500'
                                    : 'bg-gradient-to-br from-white via-sky-100 to-violet-200 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(56,189,248,0.25)]',
                                ].join(' ')}
                              >
                                {unavailable
                                  ? TIER_FIELD_PLACEHOLDER
                                  : t('partners.hero.joinFeeTierAmount', { amount: amountStr })}
                              </p>
                            </div>
                            <p
                              className={[
                                'mt-3 text-center text-lg font-bold sm:text-xl',
                                unavailable ? 'text-zinc-500' : 'text-emerald-400',
                              ].join(' ')}
                            >
                              {unavailable
                                ? TIER_FIELD_PLACEHOLDER
                                : t('partners.hero.tierCardRebateDynamic', { pct: tier.rebatePercentLabel })}
                            </p>
                            <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-sky-400/35 to-transparent" />
                            <ul className="mt-4 space-y-2.5 mb-5 sm:mb-6">
                              {(tierCardFootnoteLists[i] ?? []).map((line, li) => (
                                <li
                                  key={`${tier.id}-${i}-${li}`}
                                  className="flex items-start gap-2 text-xs text-zinc-200 sm:text-sm"
                                >
                                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-emerald-500 text-[10px] text-white shadow-[0_0_10px_rgba(16,185,129,0.55)]">
                                    <FontAwesomeIcon icon={faCheck} />
                                  </span>
                                  <span className="leading-snug">{line}</span>
                                </li>
                              ))}
                            </ul>
                            <button
                              type="button"
                              disabled={unavailable || tierOwned}
                              onClick={() => onJoinClick(tier)}
                              className={[
                                'mt-auto h-10 w-full shrink-0 rounded-xl border text-sm font-semibold transition',
                                unavailable || tierOwned
                                  ? 'cursor-not-allowed border-white/10 bg-white/[0.04] text-zinc-500 opacity-70'
                                  : featured
                                    ? 'border-transparent bg-gradient-to-r from-sky-500 to-violet-500 text-white shadow-[0_10px_24px_-10px_rgba(59,130,246,0.6)] hover:brightness-110'
                                    : 'border-sky-500/55 bg-sky-500/10 text-sky-200 hover:border-sky-400/75 hover:bg-sky-500/20',
                              ].join(' ')}
                            >
                              {tierOwned
                                ? t('partners.hero.currentPurchased')
                                : t('partners.hero.apply')}
                            </button>
                          </div>
                          <div
                            className={[
                              'pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-cyan-400/0 via-sky-400/80 to-violet-500/0 transition-opacity duration-300',
                              featured
                                ? 'opacity-100'
                                : 'opacity-0 group-hover:opacity-100',
                            ].join(' ')}
                            aria-hidden
                          />
                        </motion.div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-10 flex w-full justify-center">
                <Link
                  to="/contact"
                  className="flex h-11 w-full max-w-lg items-center justify-center rounded-xl border border-sky-500/50 bg-transparent px-3 text-xs font-semibold text-sky-400 transition hover:border-sky-400/70 hover:bg-sky-500/10 hover:text-sky-300 sm:max-w-none sm:px-6 sm:text-sm lg:w-auto lg:px-8"
                >
                  {t('partners.hero.ctaConsult')}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section
          id="partners-audiences"
          className="scroll-mt-20 border-t border-white/[0.06] bg-surface-900/35 py-16 md:py-20"
        >
          <div className={pageWrap}>
            <header className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold text-white md:text-3xl">
                {t('partners.audiences.titleBefore')}
                <span className="bg-gradient-to-r from-zinc-100 via-violet-300 to-sky-400 bg-clip-text text-transparent">
                  {t('partners.audiences.titleGradient')}
                </span>
              </h2>
              <p className="mt-3 text-sm text-zinc-400 md:text-base">{t('partners.audiences.subtitle')}</p>
            </header>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:items-stretch">
              {audienceCards.map(({ key, icon, iconClass }, i) => (
                <article
                  key={key}
                  className={`group flex h-full min-h-0 flex-col rounded-2xl border border-white/[0.08] bg-surface-850/80 p-6 shadow-panel transition hover:border-sky-500/35 hover:shadow-[0_20px_50px_-24px_rgba(56,189,248,0.2)] ${
                    i === 1 ? 'ring-1 ring-sky-500/25' : ''
                  }`}
                >
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
                    <FontAwesomeIcon icon={icon} className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-white">
                    {t(`partners.audiences.${key}Title` as 'partners.audiences.c1Title')}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-500 group-hover:text-zinc-400">
                    {t(`partners.audiences.${key}Desc` as 'partners.audiences.c1Desc')}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="partners-traits" className="scroll-mt-20 py-16 md:py-20">
          <div className={pageWrap}>
            <header className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold md:text-3xl">
                <span className="text-white">{t('partners.traits.titleBefore')}</span>
                <span className="bg-gradient-to-r from-violet-400 via-blue-500 to-sky-400 bg-clip-text text-transparent">
                  {t('partners.traits.titleGradient')}
                </span>
              </h2>
              <p className="mt-3 text-sm text-zinc-400 md:text-base">{t('partners.traits.subtitle')}</p>
            </header>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:items-stretch">
              {traitCards.map(({ key, icon, ring }) => (
                <article
                  key={key}
                  className={`flex h-full min-h-0 flex-col rounded-2xl border border-white/[0.08] bg-surface-850/90 p-6 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.5)] ring-1 ${ring}`}
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/20 to-violet-600/15 text-sky-300 ring-1 ring-white/[0.08]">
                    <FontAwesomeIcon icon={icon} className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-sky-400">
                    {t(`partners.traits.${key}Title` as 'partners.traits.t1Title')}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-500">
                    {t(`partners.traits.${key}Desc` as 'partners.traits.t1Desc')}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="partners-stories"
          className="scroll-mt-20 border-t border-white/[0.06] bg-surface-900/40 py-16 md:py-20"
        >
          <div className={pageWrap}>
            <header className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold text-white md:text-3xl">
                {t('partners.stories.titleBefore')}
                <span className="bg-gradient-to-r from-violet-400 to-sky-400 bg-clip-text text-transparent">
                  {t('partners.stories.titleGradient')}
                </span>
              </h2>
              <p className="mt-3 text-sm text-zinc-400 md:text-base">{t('partners.stories.subtitle')}</p>
            </header>
            <div className="mt-10 rounded-2xl border border-white/[0.06] bg-surface-850/60 px-6 py-10 md:px-10 md:py-12">
              <div className="grid gap-10 md:grid-cols-3 md:gap-8">
                {(['s1', 's2', 's3'] as const).map((sk) => (
                  <div key={sk} className="text-center md:text-left">
                    <p className="text-3xl font-bold text-sky-400 md:text-4xl">
                      {t(`partners.stories.${sk}Metric` as 'partners.stories.s1Metric')}
                    </p>
                    <p className="mt-3 text-sm font-semibold text-white md:text-base">
                      {t(`partners.stories.${sk}Role` as 'partners.stories.s1Role')}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                      {t(`partners.stories.${sk}Desc` as 'partners.stories.s1Desc')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="partners-why" className="scroll-mt-20 py-16 md:pb-12 md:pt-16">
          <div className={pageWrap}>
            <div className="mx-auto w-full max-w-3xl">
            <header className="text-center">
              <h2 className="text-2xl font-bold md:text-3xl">
                <span className="text-white">{t('partners.why.titleDark')}</span>
                <span className="bg-gradient-to-r from-violet-400 to-sky-500 bg-clip-text text-transparent">
                  {t('partners.why.titleGradient')}
                </span>
              </h2>
              <p className="mt-3 text-sm text-zinc-400 md:text-base">{t('partners.why.subtitle')}</p>
            </header>
            <div className="mt-10 divide-y divide-white/[0.08] rounded-2xl border border-white/[0.08] bg-surface-850/40 px-2">
              {faqItems.map((item, idx) => {
                const open = faqOpen === idx
                return (
                  <div key={item.q}>
                    <button
                      type="button"
                      onClick={() => setFaqOpen(open ? null : idx)}
                      className="flex w-full items-center justify-between gap-4 px-4 py-5 text-left transition hover:bg-white/[0.03] md:px-5"
                      aria-expanded={open}
                    >
                      <span className="text-sm font-medium text-zinc-200 md:text-base">{item.q}</span>
                      <FontAwesomeIcon
                        icon={faChevronDown}
                        className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {open ? (
                      <div className="border-t border-white/[0.06] px-4 pb-5 pt-0 md:px-5">
                        <p className="pt-3 text-sm leading-relaxed text-zinc-500">{item.a}</p>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            </div>
          </div>
        </section>

        <div className={pageWrap}>
          <p className="mx-auto max-w-3xl pb-8 text-center text-xs leading-relaxed text-zinc-600">
            {t('partners.planAdjustNotice')}
          </p>
        </div>

        <section className="border-t border-white/[0.06] bg-surface-900/40 py-10 md:py-12">
          <div className={pageWrap}>
            <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm text-zinc-400">{t('partners.footerCtaHint')}</p>
            <Link
              to="/console/invitations"
              className="mt-4 inline-flex h-9 items-center justify-center rounded-full border border-accent/40 bg-accent/10 px-5 text-xs font-semibold text-accent-glow transition hover:border-accent/55 hover:bg-accent/20 sm:px-6 sm:text-sm"
            >
              {t('partners.footerCta')}
            </Link>
            </div>
          </div>
        </section>
    </main>
  )
}
