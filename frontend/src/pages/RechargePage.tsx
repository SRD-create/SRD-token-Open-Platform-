import { useEffect, useMemo, useState } from 'react'
import { RechargePayModal } from '@/components/RechargePayModal'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck } from '@fortawesome/free-solid-svg-icons'
import { faWeixin } from '@fortawesome/free-brands-svg-icons'
import { notify } from '@/lib/toast'
import { topUpAccount } from '@/api/nexus/account'
import { fetchTopupLimits, type TopupLimitsYuan } from '@/api/nexus/systemConfig'
import { pickNativePayQrUrl, pickPaymentFlowOrderId } from '@/api/mappers/console'
import { NexusBizError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'

const pageWrap = 'mx-auto w-full min-h-0 max-w-6xl px-4 py-6 md:px-8 lg:py-8'

/** 常用人民币充值档位（元） */
const cnyPresets = [10, 50, 100, 200, 500, 1000, 2000]

const CUSTOM_MIN = 0.01
const CUSTOM_MAX = 50000

function clampParseCustomYuan(raw: string, floor: number, ceiling: number): number | null {
  const s = raw.trim()
  if (s === '') return null
  const n = Number.parseFloat(s.replace(/[^\d.]/g, ''))
  if (Number.isNaN(n)) return null
  return Math.min(ceiling, Math.max(floor, Math.round(n * 100) / 100))
}

type TopupLimitDetailBoxProps = {
  readonly minYuan: number | null
  readonly maxYuan: number | null
  readonly cny2: Intl.NumberFormat
}

/** 单笔充值限额：与接口 `topup_min` / `topup_max` 对应展示 */
function TopupLimitDetailBox({ minYuan, maxYuan, cny2 }: TopupLimitDetailBoxProps) {
  const { t } = useTranslation()
  if (minYuan == null && maxYuan == null) return null
  return (
    <div className="rounded-lg border border-accent/25 bg-accent/[0.07] px-3 py-2.5">
      <p className="text-xs font-medium text-zinc-300">{t('console.recharge.limitDetailTitle')}</p>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        {minYuan != null ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <dt className="text-xs text-zinc-500">{t('console.recharge.limitDetailMinLabel')}</dt>
            <dd className="text-sm font-semibold tabular-nums text-zinc-50">{cny2.format(minYuan)}</dd>
          </div>
        ) : null}
        {maxYuan != null ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <dt className="text-xs text-zinc-500">{t('console.recharge.limitDetailMaxLabel')}</dt>
            <dd className="text-sm font-semibold tabular-nums text-zinc-50">{cny2.format(maxYuan)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  )
}

export function RechargePage() {
  const { t, i18n } = useTranslation()
  const { token } = useAuth()
  const [amountMode, setAmountMode] = useState<'preset' | 'custom'>('preset')
  const [amountYuan, setAmountYuan] = useState(100)
  const [customInput, setCustomInput] = useState('')
  const [topupLimits, setTopupLimits] = useState<TopupLimitsYuan>({ minYuan: null, maxYuan: null })
  const payMethod = 'wechat' as const
  const [payModalOpen, setPayModalOpen] = useState(false)
  const [remoteQrUrl, setRemoteQrUrl] = useState<string | null>(null)
  const [payOrderId, setPayOrderId] = useState<number | null>(null)
  const [paySubmitting, setPaySubmitting] = useState(false)

  const effectiveMin = topupLimits.minYuan ?? CUSTOM_MIN
  const effectiveMax = topupLimits.maxYuan ?? CUSTOM_MAX

  const localeTag = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'
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

  useEffect(() => {
    if (!token) return
    void (async () => {
      try {
        const lim = await fetchTopupLimits()
        setTopupLimits(lim)
      } catch {
        setTopupLimits({ minYuan: null, maxYuan: null })
        notify.error(t('console.recharge.limitsLoadFail'))
      }
    })()
  }, [token, t])

  /** 接口返回限额后，把当前档位修正到允许区间（含预设按钮不可用时的回退） */
  useEffect(() => {
    const min = topupLimits.minYuan ?? CUSTOM_MIN
    const max = topupLimits.maxYuan ?? CUSTOM_MAX
    setAmountYuan((prev) => {
      if (prev >= min - 1e-9 && prev <= max + 1e-9) return prev
      if (prev < min - 1e-9) {
        const hit = cnyPresets.find((n) => n >= min - 1e-9 && n <= max + 1e-9)
        return hit ?? Math.min(max, Math.max(min, prev))
      }
      const hit = [...cnyPresets].reverse().find((n) => n <= max + 1e-9 && n >= min - 1e-9)
      return hit ?? max
    })
  }, [topupLimits.minYuan, topupLimits.maxYuan])

  const effectiveYuan = useMemo(() => {
    if (amountMode === 'preset') return amountYuan
    const parsed = clampParseCustomYuan(customInput, effectiveMin, effectiveMax)
    return parsed ?? 0
  }, [amountMode, amountYuan, customInput, effectiveMin, effectiveMax])

  const amountDisplay = effectiveYuan.toFixed(2)

  const minDisplay = effectiveMin.toFixed(2)
  const maxDisplay = effectiveMax.toFixed(2)

  return (
    <div className={`${pageWrap} h-full min-h-0 overflow-y-auto scrollbar-surface`}>
      <RechargePayModal
        open={payModalOpen}
        onClose={() => {
          setPayModalOpen(false)
          setRemoteQrUrl(null)
          setPayOrderId(null)
        }}
        method={payMethod}
        amountDisplay={amountDisplay}
        remoteQrUrl={remoteQrUrl}
        payOrderId={payOrderId}
      />
      <div className="mt-8">
        <p className="text-sm text-zinc-500">{t('console.recharge.payAmount')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 gap-y-3">
          {cnyPresets.map((n) => {
            const outOfRange = n < effectiveMin - 1e-9 || n > effectiveMax + 1e-9
            return (
              <button
                key={n}
                type="button"
                disabled={outOfRange}
                onClick={() => {
                  setAmountMode('preset')
                  setAmountYuan(n)
                }}
                className={`rounded-lg border px-3 py-2 text-sm tabular-nums transition ${
                  amountMode === 'preset' && amountYuan === n
                    ? 'border-accent/50 bg-accent/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(139,92,246,0.12)]'
                    : outOfRange
                      ? 'cursor-not-allowed border-white/[0.06] bg-surface-900/40 text-zinc-600 opacity-50'
                      : 'border-white/[0.08] bg-surface-850/80 text-zinc-300 hover:border-zinc-500/35'
                }`}
              >
                ¥{n}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => {
              setAmountMode('custom')
              setCustomInput((prev) =>
                prev !== '' ? prev : amountMode === 'preset' ? String(amountYuan) : '',
              )
            }}
            className={`ml-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              amountMode === 'custom'
                ? 'border-accent/50 bg-accent/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(139,92,246,0.12)]'
                : 'border-transparent bg-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t('console.recharge.custom')}
          </button>
        </div>

        <div className="mt-4 max-w-xl">
          <TopupLimitDetailBox minYuan={topupLimits.minYuan} maxYuan={topupLimits.maxYuan} cny2={cny2} />
        </div>

        {amountMode === 'custom' ? (
          <div className="mt-4 max-w-xl">
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.12] bg-surface-850/90 px-4 py-3 ring-1 ring-inset ring-white/[0.04] transition focus-within:border-accent/40 focus-within:ring-accent/15">
              <span className="shrink-0 text-lg font-medium tabular-nums text-zinc-400">¥</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={t('console.recharge.placeholderAmount')}
                value={customInput}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) {
                    setCustomInput(v)
                  }
                }}
                onBlur={() => {
                  const p = clampParseCustomYuan(customInput, effectiveMin, effectiveMax)
                  if (p !== null) setCustomInput(String(p))
                }}
                className="min-w-0 flex-1 bg-transparent text-base tabular-nums text-white placeholder:text-zinc-600 outline-none"
                aria-describedby="recharge-custom-hint"
              />
            </div>
            <p id="recharge-custom-hint" className="mt-2 text-xs text-zinc-500">
              {t('console.recharge.hintRange', { min: minDisplay, max: maxDisplay })}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-8">
        <p className="text-sm text-zinc-500">{t('console.recharge.total')}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums text-white">¥{amountDisplay}</p>
      </div>

      <div className="mt-10">
        <p className="text-sm text-zinc-500">{t('console.recharge.payMethod')}</p>
        <div className="mt-3 space-y-3">
          <button
            type="button"
            className={`flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition ${
              payMethod === 'wechat'
                ? 'border-accent/40 bg-accent/[0.06] shadow-[inset_0_0_0_1px_rgba(139,92,246,0.07)]'
                : 'border-white/[0.08] bg-surface-850/60 hover:border-zinc-500/30'
            }`}
          >
            <div className="flex items-center gap-3 text-sm text-zinc-200">
              <FontAwesomeIcon icon={faWeixin} className="text-xl text-[#07C160]" />
              <span className="font-medium text-white">{t('console.recharge.wechatPay')}</span>
            </div>
            {payMethod === 'wechat' ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-accent-glow/35 bg-accent/10 text-accent-glow">
                <FontAwesomeIcon icon={faCheck} className="text-xs" />
              </span>
            ) : (
              <span className="h-8 w-8 rounded-full border border-white/10" />
            )}
          </button>
        </div>
      </div>

      <button
        type="button"
        disabled={paySubmitting}
        className="mt-10 inline-flex h-10 min-w-[7.5rem] items-center justify-center rounded-lg bg-white px-6 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => {
          void (async () => {
            if (effectiveYuan <= 0) {
              notify.error(t('console.recharge.toastAmountRequired'))
              return
            }
            if (effectiveYuan < effectiveMin - 1e-9) {
              notify.error(t('console.recharge.toastAmountBelowMin', { min: minDisplay }))
              return
            }
            if (effectiveYuan > effectiveMax + 1e-9) {
              notify.error(t('console.recharge.toastAmountAboveMax', { max: maxDisplay }))
              return
            }
            if (!token) {
              return
            }
            setPaySubmitting(true)
            setRemoteQrUrl(null)
            setPayOrderId(null)
            try {
              const topup = await topUpAccount({
                amount: effectiveYuan,
                payment_method: payMethod,
              })
              setRemoteQrUrl(pickNativePayQrUrl(topup))
              setPayOrderId(pickPaymentFlowOrderId(topup))
              setPayModalOpen(true)
            } catch (e) {
              const msg =
                e instanceof NexusBizError
                  ? e.message
                  : e instanceof Error
                    ? e.message
                    : t('console.recharge.payStartFail')
              notify.error(msg)
            } finally {
              setPaySubmitting(false)
            }
          })()
        }}
      >
        {paySubmitting ? t('console.common.loading') : t('console.recharge.nextStep')}
      </button>
    </div>
  )
}
