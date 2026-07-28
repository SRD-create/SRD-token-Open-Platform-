import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faCubes, faGem, faXmark } from '@fortawesome/free-solid-svg-icons'
import { listPackages, listUserPackages, purchasePackage } from '@/api/nexus/packages'
import {
  pickNativePayQrUrl,
  pickPackageRow,
  pickPaymentFlowOrderId,
  userOwnedPackageIds,
  userOwnedPackagePeriodsByCatalogId,
} from '@/api/mappers/console'
import { NexusBizError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { ContentNotice } from '@/components/ContentNotice'
import { notify } from '@/lib/toast'
import { RechargePayModal } from '@/components/RechargePayModal'

const pageWrap =
  'mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col overflow-y-auto px-4 pb-6 pt-4 scrollbar-surface md:px-8 lg:pb-8 lg:pt-4'

const cardShell =
  'group relative flex flex-col rounded-2xl border border-white/[0.08] bg-surface-850/80 p-5 shadow-panel transition-[border-color,box-shadow,ring-color,transform,background-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-accent/55 hover:bg-surface-800/75 hover:shadow-[0_0_44px_-10px_rgba(139,92,246,0.45)] hover:ring-2 hover:ring-accent/35'

/** 按行展示说明；无换行时整段作为一行 */
function splitPackageDescriptionLines(desc: string): string[] {
  return desc
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
}

/** Ultra 档位：名称含 Ultra（不区分大小写），用于推荐高亮 */
function isUltraRecommendedTier(packageName: string): boolean {
  return /ultra/i.test(packageName.trim())
}

/** 已购卡片「到期」展示串（`formatApiDateTimeForDisplay`）→ 相对当前时间的剩余整天数（ceil，不足一天按一天计；已过期为 0） */
function remainingDaysFromDisplayedEndAt(endAtDisplay: string): number | null {
  const s = endAtDisplay.trim()
  if (!s || s === '—') return null
  const isoish = s.includes('T') ? s : s.replace(' ', 'T')
  const endMs = Date.parse(isoish)
  if (!Number.isFinite(endMs)) return null
  const dayMs = 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((endMs - Date.now()) / dayMs))
}

export function PlansPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token, refreshMe } = useAuth()
  const [rows, setRows] = useState<ReturnType<typeof pickPackageRow>[]>([])
  const [owned, setOwned] = useState<Set<number>>(new Set())
  const [ownedPeriods, setOwnedPeriods] = useState<Map<number, { startAt: string; endAt: string }>>(
    () => new Map(),
  )
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [payModalOpen, setPayModalOpen] = useState(false)
  const [payAmountDisplay, setPayAmountDisplay] = useState('0.00')
  const [payQrUrl, setPayQrUrl] = useState<string | null>(null)
  const [payOrderId, setPayOrderId] = useState<number | null>(null)
  const [planTab, setPlanTab] = useState<'common' | 'package'>('package')
  const didInitPlanTabRef = useRef(false)
  const [modelsModal, setModelsModal] = useState<{
    packageName: string
    isAllModels: boolean
    labels: string[]
  } | null>(null)

  const load = useCallback(async () => {
    if (!token) {
      setRows([])
      setOwned(new Set())
      setOwnedPeriods(new Map())
      setLoading(false)
      didInitPlanTabRef.current = false
      return
    }
    setLoading(true)
    try {
      const [p, u] = await Promise.all([
        listPackages({ limit: 100, offset: 0 }),
        listUserPackages({ limit: 100, offset: 0 }),
      ])
      setRows(p.items.map((it) => pickPackageRow(it)).filter((r) => r.id > 0))
      setOwned(userOwnedPackageIds(u.items))
      setOwnedPeriods(userOwnedPackagePeriodsByCatalogId(u.items))
    } catch (e) {
      setRows([])
      setOwned(new Set())
      setOwnedPeriods(new Map())
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('console.plans.loadFail')
      notify.error(msg)
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!modelsModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModelsModal(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modelsModal])

  useEffect(() => {
    if (loading || rows.length === 0) return
    if (didInitPlanTabRef.current) return
    didInitPlanTabRef.current = true
    const hasCommon = rows.some((r) => r.packageType === 'common')
    const hasPackage = rows.some((r) => r.packageType === 'package')
    if (hasCommon && !hasPackage) setPlanTab('common')
    else if (hasPackage && !hasCommon) setPlanTab('package')
    else setPlanTab('package')
  }, [loading, rows])

  const visibleRows = useMemo(
    () => rows.filter((r) => r.packageType === planTab),
    [rows, planTab],
  )

  const onPurchase = async (packageId: number) => {
    if (!token) {
      return
    }
    setBusyId(packageId)
    try {
      const raw = await purchasePackage(packageId, { payment_method: 'wechat' })
      const picked = rows.find((r) => r.id === packageId)
      setPayAmountDisplay((picked?.priceYuan ?? 0).toFixed(2))
      setPayQrUrl(pickNativePayQrUrl(raw))
      setPayOrderId(pickPaymentFlowOrderId(raw))
      setPayModalOpen(true)
    } catch (e) {
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('console.plans.purchaseFail')
      notify.error(msg)
    } finally {
      setBusyId(null)
    }
  }

  const emptyHint = useMemo(() => {
    if (!token) return null
    if (!loading && rows.length === 0) return t('console.plans.empty')
    return null
  }, [token, loading, rows.length, t])

  return (
    <div className={pageWrap}>
      {modelsModal ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModelsModal(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="plans-models-modal-title"
            className="flex min-h-0 w-full max-w-md max-h-[min(36rem,calc(100dvh-3rem))] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-surface-900/95 shadow-panel ring-1 ring-black/40"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
              <div className="min-w-0">
                <h2 id="plans-models-modal-title" className="text-base font-semibold text-white">
                  {t('console.plans.modelsModalTitle')}
                </h2>
                <p className="mt-1 truncate text-sm text-zinc-500" title={modelsModal.packageName}>
                  {t('console.plans.modelsModalSubtitle', { name: modelsModal.packageName })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModelsModal(null)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
                aria-label={t('console.common.close')}
              >
                <FontAwesomeIcon icon={faXmark} className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="scrollbar-surface min-h-0 max-h-[min(32rem,calc(100dvh-10rem))] flex-1 overflow-y-auto overscroll-y-contain px-5 py-4">
              {modelsModal.isAllModels ? (
                <p className="rounded-xl border border-accent/35 bg-accent/10 px-3 py-2.5 text-sm text-accent-glow">
                  {t('console.plans.tagAllModels')}
                </p>
              ) : modelsModal.labels.length > 0 ? (
                <ul className="space-y-2">
                  {modelsModal.labels.map((label, i) => (
                    <li
                      key={`${label}-${i}`}
                      className="break-all rounded-xl border border-accent/35 bg-accent/10 px-3 py-2.5 text-sm text-accent-glow"
                    >
                      {label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">{t('console.plans.modelsModalEmpty')}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <RechargePayModal
        open={payModalOpen}
        onClose={() => {
          setPayModalOpen(false)
          setPayQrUrl(null)
          setPayOrderId(null)
          void load()
        }}
        onConfirmPaid={async () => {
          await refreshMe()
          await load()
        }}
        onPaidDone={() => {
          window.setTimeout(() => {
            navigate('/console/api-keys?tab=package')
          }, 1000)
        }}
        method="wechat"
        amountDisplay={payAmountDisplay}
        remoteQrUrl={payQrUrl}
        payOrderId={payOrderId}
        copyFailTitle={t('console.plans.payFailTitle')}
        copyFailHint={t('console.plans.payFailHint')}
        copyFailDone={t('console.plans.payFailDone')}
      />
      {emptyHint ? (
        <ContentNotice>
          <p>{emptyHint}</p>
        </ContentNotice>
      ) : null}

      {loading ? (
        <div className="mt-6 flex min-h-[12rem] items-center justify-center text-sm text-zinc-500">
          {t('console.common.loading')}
        </div>
      ) : rows.length === 0 ? null : (
        <>
          <LayoutGroup>
            <div
              className="mt-3 inline-flex w-fit shrink-0 items-center gap-1 rounded-xl border border-white/[0.08] bg-surface-900/50 p-1"
              role="tablist"
              aria-label={t('console.nav.plans')}
            >
              <button
                type="button"
                role="tab"
                aria-selected={planTab === 'common'}
                className={[
                  'relative min-h-10 shrink-0 overflow-hidden rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200',
                  planTab === 'common'
                    ? 'text-accent-glow'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200',
                ].join(' ')}
                onClick={() => setPlanTab('common')}
              >
                {planTab === 'common' ? (
                  <motion.span
                    layoutId="plansTabIndicator"
                    className="pointer-events-none absolute inset-0 z-0 rounded-lg bg-accent/20 ring-1 ring-accent/35"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="relative z-10">{t('console.plans.tabMetering')}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={planTab === 'package'}
                className={[
                  'relative min-h-10 shrink-0 overflow-hidden rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200',
                  planTab === 'package'
                    ? 'text-accent-glow'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200',
                ].join(' ')}
                onClick={() => setPlanTab('package')}
              >
                {planTab === 'package' ? (
                  <motion.span
                    layoutId="plansTabIndicator"
                    className="pointer-events-none absolute inset-0 z-0 rounded-lg bg-accent/20 ring-1 ring-accent/35"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="relative z-10">{t('console.plans.tabPackage')}</span>
              </button>
            </div>
          </LayoutGroup>

          <AnimatePresence mode="wait">
            <motion.div
              key={planTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5"
            >
              {visibleRows.length === 0 ? (
                <div className="flex min-h-[12rem] items-center justify-center rounded-xl border border-white/[0.06] bg-surface-850/40 px-4 text-center text-sm text-zinc-500">
                  {t('console.plans.tabEmpty')}
                </div>
              ) : (
                <div
                  className={[
                    'grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3',
                    visibleRows.some((r) => isUltraRecommendedTier(r.name)) ? 'pt-3 sm:pt-4' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {visibleRows.map((tier) => {
                    const isOwned = owned.has(tier.id)
                    const period = ownedPeriods.get(tier.id)
                    const showOwnedPeriod =
                      tier.packageType === 'package' &&
                      isOwned &&
                      period != null &&
                      (period.startAt !== '—' || period.endAt !== '—')
                    const hasModelsInfo = tier.isAllModels || tier.modelLabels.length > 0
                    const isUltraHighlight = isUltraRecommendedTier(tier.name)
                    const showPackageRenew = tier.packageType === 'package' && isOwned
                    const remainingDays =
                      showOwnedPeriod && period
                        ? remainingDaysFromDisplayedEndAt(period.endAt)
                        : null
                    return (
                      <div
                        key={tier.id}
                        className={[
                          cardShell,
                          'h-full',
                          isUltraHighlight
                            ? 'overflow-visible border-2 border-accent/85 bg-gradient-to-b from-accent/[0.22] via-surface-850/80 to-surface-850/74 shadow-[0_0_0_1px_rgba(167,139,250,0.35),0_0_36px_-12px_rgba(139,92,246,0.42)] ring-2 ring-accent-glow/45 hover:border-accent-glow hover:from-accent/[0.28] hover:via-surface-800/84 hover:to-surface-800/77 hover:shadow-[0_0_0_1px_rgba(192,165,250,0.45),0_0_44px_-10px_rgba(139,92,246,0.52)] hover:ring-accent-glow/65'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {isUltraHighlight ? (
                          <div
                            aria-hidden
                            className="pointer-events-none absolute -inset-px z-0 rounded-2xl will-change-[transform,opacity,box-shadow] animate-ultra-card-edge motion-reduce:animate-none"
                          />
                        ) : null}
                        {isUltraHighlight ? (
                          <div className="absolute left-1/2 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 justify-center">
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full border-2 border-accent-dim bg-accent px-3.5 py-1 text-[11px] font-semibold tracking-wide text-white shadow-md"
                              role="status"
                            >
                              <FontAwesomeIcon icon={faGem} className="h-3 w-3 text-amber-100" aria-hidden />
                              {t('console.plans.recommendedBadge')}
                            </span>
                          </div>
                        ) : null}
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="min-w-0 flex-1 pr-2 text-base font-semibold leading-snug text-zinc-100">
                            {tier.name}
                          </h3>
                          {hasModelsInfo ? (
                            <button
                              type="button"
                              onClick={() =>
                                setModelsModal({
                                  packageName: tier.name,
                                  isAllModels: tier.isAllModels,
                                  labels: tier.modelLabels,
                                })
                              }
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/35 bg-accent/15 text-accent-glow transition hover:border-accent/50 hover:bg-accent/25"
                              aria-label={t('console.plans.modelsModalOpenAria')}
                              title={t('console.plans.modelsModalOpenAria')}
                            >
                              <FontAwesomeIcon icon={faCubes} className="h-4 w-4" aria-hidden />
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-3 flex shrink-0 flex-wrap items-baseline gap-1">
                          <span className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                            {tier.priceLabel}
                            {planTab === 'package' && tier.durationDays > 0 ? (
                              <span className="font-semibold text-zinc-400">
                                {' '}
                                / {tier.durationDays}
                                {t('console.plans.durationDaysUnit')}
                              </span>
                            ) : null}
                          </span>
                        </p>
                        {planTab === 'package' ? (
                          <div className="mt-2 flex min-h-[2.25rem] shrink-0 items-start">
                            {showOwnedPeriod && period ? (
                              <p
                                className="min-w-0 flex-1 text-[10px] leading-snug tabular-nums text-zinc-500"
                                title={[
                                  `${t('console.plans.ownedValidFrom')} ${period.startAt} · ${t('console.plans.ownedValidUntil')} ${period.endAt}`,
                                  remainingDays !== null
                                    ? t('console.plans.remainingDays', { days: remainingDays })
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              >
                                <span className="font-medium text-zinc-600">
                                  {t('console.plans.ownedValidFrom')}
                                </span>{' '}
                                <span className="text-zinc-400">{period.startAt}</span>
                                <span className="px-1.5 text-zinc-600" aria-hidden>
                                  ·
                                </span>
                                <span className="font-medium text-zinc-600">
                                  {t('console.plans.ownedValidUntil')}
                                </span>{' '}
                                <span className="text-zinc-400">{period.endAt}</span>
                                {remainingDays !== null ? (
                                  <>
                                    <span className="px-1.5 text-zinc-600" aria-hidden>
                                      ·
                                    </span>
                                    <span className="font-medium text-zinc-600">
                                      {t('console.plans.remainingDays', { days: remainingDays })}
                                    </span>
                                  </>
                                ) : null}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="mt-4 shrink-0">
                          {showPackageRenew ? (
                            <button
                              type="button"
                              disabled={busyId === tier.id}
                              onClick={() => void onPurchase(tier.id)}
                              className="w-full rounded-full border-2 border-accent bg-accent/25 py-2.5 text-sm font-semibold text-white shadow-none transition hover:border-accent-glow hover:bg-accent hover:shadow-glow disabled:opacity-50"
                            >
                              {busyId === tier.id ? t('console.common.loading') : t('console.plans.renew')}
                            </button>
                          ) : isOwned ? (
                            <button
                              type="button"
                              disabled
                              className="w-full cursor-not-allowed rounded-full border border-white/[0.08] bg-white/[0.04] py-2.5 text-sm font-medium text-zinc-500"
                            >
                              {t('console.plans.owned')}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyId === tier.id}
                              onClick={() => void onPurchase(tier.id)}
                              className="w-full rounded-full bg-white py-2.5 text-sm font-semibold text-black shadow-none transition hover:bg-accent hover:text-white hover:shadow-glow disabled:opacity-50"
                            >
                              {busyId === tier.id ? t('console.common.loading') : t('console.plans.buy')}
                            </button>
                          )}
                        </div>
                        <div className="mt-5 flex min-h-0 flex-1 flex-col">
                          <div
                            className="h-64 shrink-0 overflow-y-auto overscroll-y-contain rounded-xl border border-white/[0.06] bg-black/[0.12] px-2.5 py-2 scrollbar-surface sm:h-72 sm:px-3"
                            tabIndex={0}
                            aria-label={t('console.plans.descScrollRegionAria')}
                          >
                            <div className="space-y-2.5 pr-0.5">
                              {splitPackageDescriptionLines(tier.desc).map((line, i) => (
                                <div
                                  key={`${tier.id}-desc-${i}`}
                                  className="flex items-start gap-2 text-sm leading-relaxed text-zinc-500"
                                >
                                  <span className="flex h-[1lh] shrink-0 items-center" aria-hidden>
                                    <FontAwesomeIcon
                                      icon={faCheck}
                                      className="h-3.5 w-3.5 text-accent-glow opacity-90"
                                    />
                                  </span>
                                  <span className="min-w-0 break-words">{line}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  )
}
