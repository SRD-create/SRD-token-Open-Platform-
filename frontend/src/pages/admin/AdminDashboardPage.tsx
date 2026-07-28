import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faBolt,
  faChartLine,
  faCubes,
  faHandshake,
  faMoneyBillWave,
  faUsers,
} from '@fortawesome/free-solid-svg-icons'
import { fetchAdminDashboard, type AdminDashboardData } from '@/api/nexus/adminDashboard'
import { NexusBizError } from '@/api/errors'
import { notify } from '@/lib/toast'

const pageWrap = 'mx-auto w-full max-w-6xl px-4 py-6 md:px-8 lg:py-8'

const tiltIdle = 'rotateX(0deg) rotateY(0deg) translateZ(0px)' as const

function AdminStatTiltCard({ children, className }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState<string>(tiltIdle)

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduceMotion) return
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    const max = 10
    const ry = (px - 0.5) * 2 * max
    const rx = (0.5 - py) * 2 * max
    setTransform(`rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(12px)`)
  }

  function onLeave() {
    setTransform(tiltIdle)
  }

  const cardBody = 'flex h-full min-h-0 flex-col'

  if (reduceMotion) {
    return <div className={`${className ?? ''} ${cardBody}`}>{children}</div>
  }

  return (
    <div ref={wrapRef} className="h-full min-h-0 [perspective:920px]" onMouseMove={onMove} onMouseLeave={onLeave}>
      <div
        className={`${className ?? ''} ${cardBody} origin-center transform-gpu transition-[transform,box-shadow] duration-200 ease-out will-change-transform hover:shadow-[0_20px_44px_-16px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.06)]`}
        style={{ transform }}
      >
        {children}
      </div>
    </div>
  )
}

function svgClientToViewBox(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  return pt.matrixTransform(ctm.inverse())
}

function niceYMax(maxVal: number) {
  if (maxVal <= 0) return 100
  const step = maxVal > 200 ? 50 : 25
  return Math.ceil((maxVal * 1.12) / step) * step
}

function lastDayOfMonth(y: number, mo: number) {
  return new Date(y, mo, 0).getDate()
}

type ChartMode = 'cny' | 'tokens'
type TimeAxisMode = 'daysInMonth' | 'monthsInYear'

function AdminLineChart({
  values,
  timeAxis,
  year,
  month,
  gradientSuffix,
  title,
  subtitle,
  valueMode,
}: {
  values: readonly number[]
  timeAxis: TimeAxisMode
  year: number
  month?: number
  gradientSuffix: string
  title: string
  subtitle: string
  valueMode: ChartMode
}) {
  const { i18n } = useTranslation()
  const localeTag = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const W = 720
  const H = 168
  const pad = { l: 48, r: 20, t: 22, b: 32 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b
  const y0 = pad.t + innerH
  const y1 = pad.t
  const n = Math.max(values.length, 1)
  const span = Math.max(n - 1, 1)
  const yMax = niceYMax(Math.max(...values, 1))

  const linePts = values.map((v, i) => {
    const x = pad.l + (i / span) * innerW
    const y = y0 - (v / yMax) * innerH
    return { x, y }
  })

  const polylinePoints = linePts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaD = [
    `M ${pad.l.toFixed(1)} ${y0.toFixed(1)}`,
    ...linePts.map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `L ${(pad.l + innerW).toFixed(1)} ${y0.toFixed(1)} Z`,
  ].join(' ')

  const midY = y0 - (yMax / 2 / yMax) * innerH

  const mo = month ?? 1
  const tickIdx =
    timeAxis === 'monthsInYear'
      ? [0, 3, 6, 9, span].filter((v, i, a) => a.indexOf(v) === i && v <= span)
      : [0, Math.floor(span / 3), Math.floor((2 * span) / 3), span].filter((v, i, a) => a.indexOf(v) === i)

  const xTicks = tickIdx.map((i) => {
    const x = pad.l + (i / span) * innerW
    const label =
      timeAxis === 'monthsInYear'
        ? new Date(year, Math.min(i, 11), 1).toLocaleDateString(localeTag, { month: 'short' })
        : new Date(year, mo - 1, Math.min(i + 1, lastDayOfMonth(year, mo))).toLocaleDateString(localeTag, {
            month: 'numeric',
            day: 'numeric',
          })
    return { x, label, key: `${i}-${label}` }
  })

  const fmtY = (v: number) => {
    if (valueMode === 'tokens') {
      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
      if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
      return String(Math.round(v))
    }
    if (v >= 1000) return `¥${(v / 1000).toFixed(1)}k`
    return new Intl.NumberFormat(localeTag, {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(v)
  }

  const fmtTip = (v: number) => {
    if (valueMode === 'tokens') {
      return `${Math.round(v).toLocaleString(localeTag)} tokens`
    }
    return new Intl.NumberFormat(localeTag, {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v)
  }

  const hp = hoverIndex !== null ? linePts[hoverIndex] : null
  const tipW = valueMode === 'tokens' ? 268 : 210
  const tipH = 76
  const tipGapAbove = 46
  let tipX = hp ? hp.x - tipW / 2 : 0
  let tipY = hp ? hp.y - tipH - tipGapAbove : 0
  if (hp) {
    tipX = Math.max(pad.l + 2, Math.min(tipX, W - pad.r - tipW - 2))
    if (tipY < y1 + 4) tipY = y1 + 4
  }

  const hi = hoverIndex ?? 0
  const tipVal = fmtTip(values[hi] ?? 0)

  function onChartPointer(e: React.PointerEvent<SVGSVGElement>) {
    const svg = e.currentTarget
    const p = svgClientToViewBox(svg, e.clientX, e.clientY)
    if (!p) return
    if (p.x < pad.l || p.x > pad.l + innerW || p.y < pad.t || p.y > y0) {
      setHoverIndex(null)
      return
    }
    const t = (p.x - pad.l) / innerW
    const idx = Math.max(0, Math.min(n - 1, Math.round(t * span)))
    setHoverIndex(idx)
  }

  const lineGradId = `adminLineGrad-${gradientSuffix}`
  const areaGradId = `adminAreaGrad-${gradientSuffix}`

  return (
    <div className="rounded-xl border border-white/[0.08] bg-surface-850/90 p-4">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
      </div>
      <div className="mt-3 w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-40 min-w-[min(100%,720px)] w-full cursor-crosshair touch-none text-zinc-600"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId)
            onChartPointer(e)
          }}
          onPointerMove={onChartPointer}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture?.(e.pointerId)
          }}
          onPointerLeave={() => setHoverIndex(null)}
          onPointerCancel={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={lineGradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#c4b5fd" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#7c3aed" />
            </linearGradient>
            <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(167, 139, 250)" stopOpacity="0.22" />
              <stop offset="70%" stopColor="rgb(139, 92, 246)" stopOpacity="0.06" />
              <stop offset="100%" stopColor="rgb(124, 58, 237)" stopOpacity="0" />
            </linearGradient>
          </defs>

          <line x1={pad.l} y1={y1} x2={W - pad.r} y2={y1} stroke="currentColor" strokeOpacity={0.3} />
          <line
            x1={pad.l}
            y1={midY}
            x2={W - pad.r}
            y2={midY}
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeDasharray="4 6"
          />
          <line x1={pad.l} y1={y0} x2={W - pad.r} y2={y0} stroke="currentColor" strokeOpacity={0.3} />
          <text x={pad.l - 8} y={y1 + 4} textAnchor="end" className="fill-zinc-500 text-xs sm:text-sm">
            {fmtY(yMax)}
          </text>
          <text x={pad.l - 8} y={midY + 4} textAnchor="end" className="fill-zinc-500 text-xs sm:text-sm">
            {fmtY(yMax / 2)}
          </text>
          <text x={pad.l - 8} y={y0 + 4} textAnchor="end" className="fill-zinc-500 text-xs sm:text-sm">
            {fmtY(0)}
          </text>
          {xTicks.map((tk) => (
            <text key={tk.key} x={tk.x} y={H - 8} textAnchor="middle" className="fill-zinc-500 text-xs sm:text-sm">
              {tk.label}
            </text>
          ))}

          <path d={areaD} fill={`url(#${areaGradId})`} pointerEvents="none" />
          <polyline
            fill="none"
            stroke={`url(#${lineGradId})`}
            strokeWidth={2.25}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={polylinePoints}
            pointerEvents="none"
          />

          {hoverIndex !== null && hp && (
            <g pointerEvents="none">
              <line
                x1={hp.x}
                y1={y0}
                x2={hp.x}
                y2={y1}
                stroke="rgb(161, 161, 170)"
                strokeOpacity={0.4}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <circle cx={hp.x} cy={hp.y} r={5} fill="rgb(244, 244, 245)" />
              <circle cx={hp.x} cy={hp.y} r={3} fill="#8b5cf6" />
              <rect
                x={tipX}
                y={tipY}
                width={tipW}
                height={tipH}
                rx={8}
                fill="rgb(24, 24, 27)"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={1}
              />
              <text
                x={tipX + tipW / 2}
                y={tipY + 30}
                textAnchor="middle"
                className="fill-zinc-100"
                fontSize={26}
                fontWeight={600}
              >
                {timeAxis === 'monthsInYear'
                  ? new Date(year, hi, 1).toLocaleDateString(localeTag, { year: 'numeric', month: 'long' })
                  : new Date(year, mo - 1, hi + 1).toLocaleDateString(localeTag, {
                      month: 'long',
                      day: 'numeric',
                    })}
              </text>
              <text
                x={tipX + tipW / 2}
                y={tipY + 60}
                textAnchor="middle"
                className="fill-white tabular-nums"
                fontSize={28}
                fontWeight={700}
              >
                {tipVal}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}

/** 与控制台图表卡一致的深色底 */
function AdminThemedMetricCard({
  iconWrapClass,
  icon,
  label,
  value,
}: {
  iconWrapClass: string
  icon: IconDefinition
  label: ReactNode
  value: ReactNode
}) {
  return (
    <AdminStatTiltCard className="rounded-xl border border-white/[0.08] bg-surface-850/90 p-3.5 sm:p-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-zinc-500">{label}</p>
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconWrapClass}`} aria-hidden>
            <FontAwesomeIcon icon={icon} className="h-[1.05rem] w-[1.05rem]" />
          </div>
        </div>
        <p className="text-2xl font-semibold tracking-tight text-white tabular-nums sm:text-[1.65rem]">{value}</p>
      </div>
    </AdminStatTiltCard>
  )
}

function emptyDash(year: number): AdminDashboardData {
  const z = Array.from({ length: 12 }, () => 0)
  return {
    totalUsers: 0,
    totalAgents: 0,
    monthRevenue: 0,
    monthTokenUsage: 0,
    monthWithdraw: 0,
    totalModels: 0,
    yearMonthlyRevenue: z,
    yearMonthlyTokens: z,
    yearMonthlyWithdraw: z,
    topTokenUsers: [],
    topPackages: [],
    topModels: [],
    statYear: year,
  }
}

export function AdminDashboardPage() {
  const { t, i18n } = useTranslation()
  const localeTag = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'

  const [dash, setDash] = useState<AdminDashboardData>(() => emptyDash(new Date().getFullYear()))
  const [dashLoading, setDashLoading] = useState(true)

  const loadDash = useCallback(async () => {
    setDashLoading(true)
    try {
      const d = await fetchAdminDashboard()
      setDash(d)
    } catch (e) {
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('admin.dashboard.loadFail')
      notify.error(msg || t('admin.dashboard.loadFail'))
      setDash(emptyDash(new Date().getFullYear()))
    } finally {
      setDashLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadDash()
  }, [loadDash])

  const yearLabel = useMemo(
    () =>
      new Date(dash.statYear, 0, 1).toLocaleDateString(localeTag, {
        year: 'numeric',
      }),
    [dash.statYear, localeTag],
  )

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat(localeTag, { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 }).format(n)

  const fmtTok = (n: number) =>
    n >= 1_000_000_000
      ? `${(n / 1_000_000_000).toFixed(2)}B`
      : n >= 1_000_000
        ? `${(n / 1_000_000).toFixed(1)}M`
        : n.toLocaleString(localeTag)

  const fmtQty = (n: number) => n.toLocaleString(localeTag)

  return (
    <div className="scrollbar-surface flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      <div className={pageWrap}>
        {dashLoading ? (
          <div className="flex min-h-[12rem] items-center justify-center text-sm text-zinc-500">
            {t('console.common.loading')}
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <AdminThemedMetricCard
                iconWrapClass="border border-sky-400/40 bg-sky-500/10 text-sky-300/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
                icon={faUsers}
                label={t('admin.dashboard.cardUsers')}
                value={dash.totalUsers.toLocaleString(localeTag)}
              />
              <AdminThemedMetricCard
                iconWrapClass="border border-indigo-400/40 bg-indigo-500/10 text-indigo-200/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
                icon={faHandshake}
                label={t('admin.dashboard.cardAgents')}
                value={dash.totalAgents.toLocaleString(localeTag)}
              />
              <AdminThemedMetricCard
                iconWrapClass="border border-emerald-400/40 bg-emerald-500/10 text-emerald-300/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
                icon={faChartLine}
                label={t('admin.dashboard.cardMonthRevenue')}
                value={fmtMoney(dash.monthRevenue)}
              />
              <AdminThemedMetricCard
                iconWrapClass="border border-violet-400/45 bg-violet-500/12 text-violet-200/95 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
                icon={faBolt}
                label={t('admin.dashboard.cardMonthTokens')}
                value={fmtTok(dash.monthTokenUsage)}
              />
              <AdminThemedMetricCard
                iconWrapClass="border border-teal-400/40 bg-teal-500/10 text-teal-200/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
                icon={faMoneyBillWave}
                label={t('admin.dashboard.cardMonthWithdraw')}
                value={fmtMoney(dash.monthWithdraw)}
              />
              <AdminThemedMetricCard
                iconWrapClass="border border-amber-400/40 bg-amber-500/10 text-amber-300/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
                icon={faCubes}
                label={t('admin.dashboard.cardModelsTotal')}
                value={dash.totalModels.toLocaleString(localeTag)}
              />
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-3">
              <AdminLineChart
                values={dash.yearMonthlyRevenue}
                timeAxis="monthsInYear"
                year={dash.statYear}
                gradientSuffix="rev-y"
                title={t('admin.dashboard.chartYearRevenueTitle')}
                subtitle={t('admin.dashboard.chartYearSubtitle', { year: yearLabel })}
                valueMode="cny"
              />
              <AdminLineChart
                values={dash.yearMonthlyTokens}
                timeAxis="monthsInYear"
                year={dash.statYear}
                gradientSuffix="tok-y"
                title={t('admin.dashboard.chartYearTokensTitle')}
                subtitle={t('admin.dashboard.chartYearSubtitle', { year: yearLabel })}
                valueMode="tokens"
              />
              <AdminLineChart
                values={dash.yearMonthlyWithdraw}
                timeAxis="monthsInYear"
                year={dash.statYear}
                gradientSuffix="wdr-y"
                title={t('admin.dashboard.chartYearWithdrawTitle')}
                subtitle={t('admin.dashboard.chartYearSubtitle', { year: yearLabel })}
                valueMode="cny"
              />
            </div>

            <div className="mt-6 rounded-xl border border-white/[0.08] bg-surface-850/90 p-5">
              <h2 className="text-base font-semibold text-white">{t('admin.dashboard.top10UsersTitle')}</h2>
              <ul className="mt-4 divide-y divide-white/[0.06]">
                {dash.topTokenUsers.length === 0 ? (
                  <li className="py-8 text-center text-sm text-zinc-500">{t('admin.dashboard.emptyRank')}</li>
                ) : (
                  dash.topTokenUsers.map((row, idx) => (
                    <li key={`${row.name}-${idx}`} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-sm font-semibold text-violet-200">
                          {idx + 1}
                        </span>
                        <span className="truncate text-sm font-medium text-zinc-100">{row.name}</span>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-zinc-300">
                        {row.tokenUsage.toLocaleString(localeTag)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-white/[0.08] bg-surface-850/90 p-5">
                <h2 className="text-base font-semibold text-white">{t('admin.dashboard.top3PackagesTitle')}</h2>
                <ul className="mt-4 divide-y divide-white/[0.06]">
                  {dash.topPackages.length === 0 ? (
                    <li className="py-8 text-center text-sm text-zinc-500">{t('admin.dashboard.emptyRank')}</li>
                  ) : (
                    dash.topPackages.map((row, idx) => (
                      <li key={`${row.name}-${idx}`} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10 text-sm font-semibold text-violet-200">
                            {idx + 1}
                          </span>
                          <span className="truncate text-sm font-medium text-zinc-100">{row.name}</span>
                        </div>
                        <span className="shrink-0 text-sm tabular-nums text-zinc-300">{fmtQty(row.quantity)}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-surface-850/90 p-5">
                <h2 className="text-base font-semibold text-white">{t('admin.dashboard.top3ModelsTitle')}</h2>
                <ul className="mt-4 divide-y divide-white/[0.06]">
                  {dash.topModels.length === 0 ? (
                    <li className="py-8 text-center text-sm text-zinc-500">{t('admin.dashboard.emptyRank')}</li>
                  ) : (
                    dash.topModels.map((row, idx) => (
                      <li key={`${row.name}-${idx}`} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10 text-sm font-semibold text-violet-200">
                            {idx + 1}
                          </span>
                          <span className="truncate font-mono text-sm font-medium text-zinc-100">{row.name}</span>
                        </div>
                        <span className="shrink-0 text-sm tabular-nums text-zinc-300">{fmtQty(row.usageCount)}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
