import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useReducedMotion } from 'framer-motion'
import { fetchAccountBalance } from '@/api/nexus/account'
import { listTokenUsage } from '@/api/nexus/tokenUsage'
import {
  aggregateTotalTokensByDayOfMonth,
  pickAccountBalanceYuan,
  pickAccountCommissionYuan,
  pickAccountUsedTokens,
  pickAccountUsedTokensDaily,
} from '@/api/mappers/console'
import { isJoinedAgentFromMe } from '@/api/mappers/me'
import { NexusBizError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { notify } from '@/lib/toast'

const pageWrap = 'mx-auto w-full max-w-6xl px-4 py-6 md:px-8 lg:py-8'

function sumDaily(data: readonly number[]) {
  return data.reduce((a, b) => a + b, 0)
}

function niceYMax(maxVal: number) {
  if (maxVal <= 0) return 100
  const step = maxVal > 200 ? 50 : 25
  return Math.ceil((maxVal * 1.12) / step) * step
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function monthKeyFrom(y: number, m: number) {
  return `${y}-${pad2(m)}`
}

function parseMonthKey(key: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  if (!Number.isFinite(y) || mo < 1 || mo > 12) return null
  return { y, m: mo }
}

function lastDayOfMonth(y: number, mo: number) {
  return new Date(y, mo, 0).getDate()
}

const tiltIdle = 'rotateX(0deg) rotateY(0deg) translateZ(0px)' as const

const statCardFooter = 'mt-auto flex min-h-10 items-end pt-4'

function StatTiltCard({ children, className }: { children: ReactNode; className?: string }) {
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
    const max = 9
    const ry = (px - 0.5) * 2 * max
    const rx = (0.5 - py) * 2 * max
    setTransform(
      `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(10px)`,
    )
  }

  function onLeave() {
    setTransform(tiltIdle)
  }

  const cardBody = 'flex h-full min-h-0 flex-col'

  if (reduceMotion) {
    return <div className={`${className ?? ''} ${cardBody}`}>{children}</div>
  }

  return (
    <div
      ref={wrapRef}
      className="h-full min-h-0 [perspective:880px]"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div
        className={`${className ?? ''} ${cardBody} origin-center transform-gpu transition-[transform,box-shadow] duration-200 ease-out will-change-transform hover:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.72),0_0_0_1px_rgba(255,255,255,0.06)]`}
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

type ChartValueMode = 'cny' | 'tokenK' | 'tokens'

function MonthlySpendChart({
  dailyValues,
  year,
  month,
  localeTag,
  valueMode,
}: {
  dailyValues: readonly number[]
  year: number
  month: number
  localeTag: string
  valueMode: ChartValueMode
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const W = 720
  const H = 240
  const pad = { l: 48, r: 20, t: 28, b: 40 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b
  const y0 = pad.t + innerH
  const y1 = pad.t
  const days = Math.max(dailyValues.length, 1)
  const span = Math.max(days - 1, 1)
  const yMax = niceYMax(Math.max(...dailyValues, 1))

  const linePts = dailyValues.map((v, i) => {
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

  const tickIdx = [0, Math.floor(span / 3), Math.floor((2 * span) / 3), span].filter(
    (v, i, a) => a.indexOf(v) === i,
  )
  const xTicks = tickIdx.map((i) => {
    const x = pad.l + (i / span) * innerW
    const label = new Date(year, month - 1, Math.min(i + 1, lastDayOfMonth(year, month))).toLocaleDateString(
      localeTag,
      { month: 'numeric', day: 'numeric' },
    )
    return { x, label, key: `${i}-${label}` }
  })

  const fmtY = (v: number) => {
    if (valueMode === 'tokens') {
      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
      if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
      return String(Math.round(v))
    }
    if (valueMode === 'tokenK') {
      return `${v.toFixed(1)}k tok`
    }
    if (v >= 1000) return `¥${(v / 1000).toFixed(1)}k`
    return new Intl.NumberFormat(localeTag, {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(v)
  }

  const yTopLabel = fmtY(yMax)

  function onChartPointer(e: React.PointerEvent<SVGSVGElement>) {
    const svg = e.currentTarget
    const p = svgClientToViewBox(svg, e.clientX, e.clientY)
    if (!p) return
    if (p.x < pad.l || p.x > pad.l + innerW || p.y < pad.t || p.y > y0) {
      setHoverIndex(null)
      return
    }
    const t = (p.x - pad.l) / innerW
    const idx = Math.max(0, Math.min(days - 1, Math.round(t * span)))
    setHoverIndex(idx)
  }

  const hp = hoverIndex !== null ? linePts[hoverIndex] : null
  const tipW = 168
  const tipH = 52
  const tipGapAbove = 46
  let tipX = hp ? hp.x - tipW / 2 : 0
  let tipY = hp ? hp.y - tipH - tipGapAbove : 0
  if (hp) {
    tipX = Math.max(pad.l + 2, Math.min(tipX, W - pad.r - tipW - 2))
    if (tipY < y1 + 4) tipY = y1 + 4
  }

  const hi = hoverIndex ?? 0
  const tipVal =
    valueMode === 'tokens'
      ? `${Math.round(dailyValues[hi] ?? 0).toLocaleString(localeTag)} tokens`
      : valueMode === 'tokenK'
        ? `${(dailyValues[hi] ?? 0).toFixed(2)}k tokens`
        : new Intl.NumberFormat(localeTag, {
            style: 'currency',
            currency: 'CNY',
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
          }).format(dailyValues[hi] ?? 0)

  return (
    <div className="mt-4 w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-56 min-w-[min(100%,720px)] w-full touch-none cursor-crosshair text-zinc-600"
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
          <linearGradient id="usageLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
          <linearGradient id="usageAreaGrad" x1="0" y1="0" x2="0" y2="1">
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
          {yTopLabel}
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

        <path d={areaD} fill="url(#usageAreaGrad)" pointerEvents="none" />
        <polyline
          fill="none"
          stroke="url(#usageLineGrad)"
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
              strokeOpacity={0.35}
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
              y={tipY + 20}
              textAnchor="middle"
              className="fill-zinc-400 text-sm sm:text-[13px]"
            >
              {new Date(year, month - 1, hi + 1).toLocaleDateString(localeTag, {
                month: 'long',
                day: 'numeric',
              })}
            </text>
            <text
              x={tipX + tipW / 2}
              y={tipY + 42}
              textAnchor="middle"
              className="fill-white text-lg font-semibold tabular-nums sm:text-base"
            >
              {tipVal}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}

export function UsagePage() {
  const { t, i18n } = useTranslation()
  const { token, me, meLoading } = useAuth()
  const localeTag = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'

  const monthOptions = useMemo(() => {
    const out: { key: string; label: string }[] = []
    const d = new Date()
    for (let i = 0; i < 6; i++) {
      const dt = new Date(d.getFullYear(), d.getMonth() - i, 1)
      const key = monthKeyFrom(dt.getFullYear(), dt.getMonth() + 1)
      const label = dt.toLocaleDateString(localeTag, { year: 'numeric', month: 'long' })
      out.push({ key, label })
    }
    return out
  }, [localeTag])

  const [monthKey, setMonthKey] = useState(() => monthOptions[0]?.key ?? monthKeyFrom(new Date().getFullYear(), new Date().getMonth() + 1))
  const [balanceYuan, setBalanceYuan] = useState(0)
  const [commissionYuan, setCommissionYuan] = useState(0)
  const [accountUsedTokensDaily, setAccountUsedTokensDaily] = useState(0)
  const [accountUsedTokens, setAccountUsedTokens] = useState(0)
  const [monthSpend, setMonthSpend] = useState(0)
  const [dailyValues, setDailyValues] = useState<number[]>([])
  const [chartYear, setChartYear] = useState(new Date().getFullYear())
  const [chartMonth, setChartMonth] = useState(new Date().getMonth() + 1)
  const [chartMode, setChartMode] = useState<ChartValueMode>('tokens')
  const [accountLoading, setAccountLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(true)

  /** 仅影响上方四张卡片（与月份无关） */
  const loadAccount = useCallback(async () => {
    if (!token) {
      setBalanceYuan(0)
      setCommissionYuan(0)
      setAccountUsedTokensDaily(0)
      setAccountUsedTokens(0)
      setAccountLoading(false)
      return
    }

    setAccountLoading(true)
    try {
      const balRaw = await fetchAccountBalance()
      setBalanceYuan(pickAccountBalanceYuan(balRaw))
      setCommissionYuan(pickAccountCommissionYuan(balRaw))
      setAccountUsedTokensDaily(pickAccountUsedTokensDaily(balRaw))
      setAccountUsedTokens(pickAccountUsedTokens(balRaw))
    } catch (e) {
      setBalanceYuan(0)
      setCommissionYuan(0)
      setAccountUsedTokensDaily(0)
      setAccountUsedTokens(0)
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('console.usage.loadFail')
      notify.error(msg)
    } finally {
      setAccountLoading(false)
    }
  }, [token, t])

  /** 仅影响「每月用量」折线图（随月份选择变化） */
  const loadChart = useCallback(async () => {
    if (!token) {
      setMonthSpend(0)
      setDailyValues([])
      setChartLoading(false)
      return
    }

    setChartLoading(true)
    try {
      const parsed = parseMonthKey(monthKey) ?? {
        y: new Date().getFullYear(),
        m: new Date().getMonth() + 1,
      }
      const { y, m } = parsed
      setChartYear(y)
      setChartMonth(m)
      const last = lastDayOfMonth(y, m)
      const start = `${y}-${pad2(m)}-01`
      const end = `${y}-${pad2(m)}-${pad2(last)}`
      const { items } = await listTokenUsage({
        startDate: start,
        endDate: end,
        limit: 5000,
        offset: 0,
      })
      const dailyTok = aggregateTotalTokensByDayOfMonth(items, y, m)
      setChartMode('tokens')
      setDailyValues(dailyTok.length ? dailyTok : Array.from({ length: last }, () => 0))
      setMonthSpend(sumDaily(dailyTok))
    } catch (e) {
      setMonthSpend(0)
      setDailyValues([])
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('console.usage.loadFail')
      notify.error(msg)
    } finally {
      setChartLoading(false)
    }
  }, [token, monthKey, t])

  useEffect(() => {
    void loadAccount()
  }, [loadAccount])

  useEffect(() => {
    void loadChart()
  }, [loadChart])

  const spendDisplay =
    chartMode === 'tokens'
      ? new Intl.NumberFormat(localeTag, { maximumFractionDigits: 0 }).format(Math.round(monthSpend))
      : chartMode === 'cny'
        ? new Intl.NumberFormat(localeTag, {
            style: 'currency',
            currency: 'CNY',
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
          }).format(monthSpend)
        : t('console.usage.monthSpendTokenApprox', { n: monthSpend.toFixed(2) })

  const cny2 = useMemo(
    () =>
      new Intl.NumberFormat(localeTag, {
        style: 'currency',
        currency: 'CNY',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [localeTag],
  )
  const balanceDisplay = cny2.format(balanceYuan)
  const commissionDisplay = cny2.format(commissionYuan)
  const isJoinedAgent = isJoinedAgentFromMe(me)
  const agentPackageLabel = (me?.agentLevelDescription ?? '').trim()
  const authMeReady = !token || !meLoading
  const commissionAmountDisplay =
    !authMeReady || accountLoading ? '…' : isJoinedAgent ? commissionDisplay : t('console.usage.commissionPlaceholder')
  const intDisplay = useMemo(() => new Intl.NumberFormat(localeTag), [localeTag])
  const usedTokensDailyDisplay = intDisplay.format(accountUsedTokensDaily)
  const usedTokensDisplay = intDisplay.format(accountUsedTokens)

  return (
    <div className={`${pageWrap} h-full min-h-0 overflow-y-auto scrollbar-surface`}>
      <div className="grid grid-cols-1 gap-4 overflow-visible sm:grid-cols-2 sm:items-stretch xl:grid-cols-4">
        <StatTiltCard className="rounded-xl border border-white/[0.08] bg-surface-850/90 p-5">
          <p className="text-sm text-zinc-400">{t('console.usage.balanceTitle')}</p>
          <p className="mt-3 text-3xl font-semibold tabular-nums text-white">
            {accountLoading ? '…' : balanceDisplay}
          </p>
          <div className={statCardFooter}>
            <Link
              to="/console/recharge"
              className="inline-flex rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-100"
            >
              {t('console.usage.goRecharge')}
            </Link>
          </div>
        </StatTiltCard>
        <StatTiltCard className="rounded-xl border border-white/[0.08] bg-surface-850/90 p-5">
          <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
            <p className="text-sm text-zinc-400">{t('console.usage.commissionTitle')}</p>
            {authMeReady && !accountLoading && isJoinedAgent && agentPackageLabel ? (
              <span className="max-w-[min(100%,14rem)] truncate rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-300">
                {agentPackageLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-3 text-3xl font-semibold tabular-nums text-white">{commissionAmountDisplay}</p>
          <div className={statCardFooter}>
            {authMeReady && !accountLoading && !isJoinedAgent ? (
              <Link
                to="/partners"
                className="inline-flex rounded-lg border border-white/[0.14] bg-white/[0.06] px-4 py-2 text-sm font-medium text-zinc-100 transition hover:border-white/[0.22] hover:bg-white/[0.1] hover:text-white"
              >
                {t('console.usage.commissionJoinCta')}
              </Link>
            ) : authMeReady && !accountLoading && isJoinedAgent ? (
              <Link
                to="/console/commission-withdrawal"
                className="inline-flex rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-100"
              >
                {t('console.usage.commissionWithdrawCta')}
              </Link>
            ) : (
              <div className="min-h-10" aria-hidden />
            )}
          </div>
        </StatTiltCard>
        <StatTiltCard className="rounded-xl border border-white/[0.08] bg-surface-850/90 p-5">
          <p className="text-sm text-zinc-400">{t('console.usage.accountUsedTokensDailyTitle')}</p>
          <p className="mt-3 text-3xl font-semibold tabular-nums text-white">
            {accountLoading ? '…' : usedTokensDailyDisplay}
          </p>
          <div className={statCardFooter} aria-hidden />
        </StatTiltCard>
        <StatTiltCard className="rounded-xl border border-white/[0.08] bg-surface-850/90 p-5">
          <p className="text-sm text-zinc-400">{t('console.usage.accountUsedTokensTitle')}</p>
          <p className="mt-3 text-3xl font-semibold tabular-nums text-white">
            {accountLoading ? '…' : usedTokensDisplay}
          </p>
          <div className={statCardFooter} aria-hidden />
        </StatTiltCard>
      </div>

      <div className="mt-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-white">{t('console.usage.sectionTitle')}</h2>
          <select
            className="w-full rounded-lg border border-white/[0.1] bg-surface-800 px-3 py-2 text-base text-zinc-200 outline-none ring-offset-2 ring-offset-surface-950 focus:border-accent/35 focus:ring-2 focus:ring-accent/25 sm:w-auto md:text-sm"
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
            aria-label={t('console.usage.monthSelectAria')}
          >
            {monthOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          {chartMode === 'tokens'
            ? t('console.usage.tokensLine', { n: chartLoading ? '…' : spendDisplay })
            : chartMode === 'cny'
              ? t('console.usage.spendLine', { amount: spendDisplay })
              : t('console.usage.chartTokenNote')}
        </p>
        <div className="mt-2 rounded-xl border border-white/[0.08] bg-surface-850/60 px-4 py-4 md:px-6">
          {chartLoading ? (
            <div className="flex h-56 items-center justify-center text-sm text-zinc-500">{t('console.common.loading')}</div>
          ) : dailyValues.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-zinc-500">
              {t('console.usage.emptyChart')}
            </div>
          ) : (
            <MonthlySpendChart
              dailyValues={dailyValues}
              year={chartYear}
              month={chartMonth}
              localeTag={localeTag}
              valueMode={chartMode}
            />
          )}
        </div>
      </div>
    </div>
  )
}
