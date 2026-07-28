import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import QRCode from 'qrcode'
import { fetchAccountBalance } from '@/api/nexus/account'
import { fetchWithdrawalLimits, type WithdrawalLimitsYuan } from '@/api/nexus/systemConfig'
import {
  createWechatWithdrawal,
  extractWechatServiceBindAuthUrl,
  getWithdrawal,
  listWithdrawals,
  pickWithdrawalPackageInfo,
} from '@/api/nexus/withdrawals'
import { fetchCurrentUser } from '@/api/nexus/user'
import { pickAccountCommissionYuan } from '@/api/mappers/console'
import { isJoinedAgentFromMe, pickWechatServiceBoundFromUserRaw } from '@/api/mappers/me'
import {
  parseWithdrawalDetailPayload,
  pickWithdrawalIdFromPayload,
  pickWithdrawalTableRow,
} from '@/api/mappers/withdrawals'
import { NexusBizError } from '@/api/errors'
import type { WithdrawalRequest } from '@/api/types/nexus'
import { useAuth } from '@/auth/useAuth'
import { isOriginLocalhost, resolveWechatMerchantConfirmQrOrigin } from '@/lib/publicAppOrigin'
import { notify } from '@/lib/toast'
import { safeRecord } from '@/lib/safe'

const PAGE_SIZE = 10

/** 提现金额输入框：输入过程中校验防抖（毫秒） */
const WITHDRAW_AMOUNT_FIELD_DEBOUNCE_MS = 280

const WITHDRAWAL_POLL_MS = 2800

function isWithdrawalStatusCompleted(raw: string): boolean {
  const k = raw.trim().toLowerCase().replace(/\s+/g, '_')
  return (
    k === 'completed' ||
    k === 'complete' ||
    k === 'success' ||
    k === 'paid' ||
    k === 'succeed'
  )
}

function isWithdrawalStatusTerminalFailed(raw: string): boolean {
  const k = raw.trim().toLowerCase().replace(/\s+/g, '_')
  return k === 'failed' || k === 'rejected' || k === 'error' || k === 'fail' || k === 'cancelled' || k === 'canceled'
}

function isWithdrawalPendingUserConfirm(raw: string): boolean {
  const k = raw.trim().toLowerCase().replace(/\s+/g, '_')
  return k === 'pending_user_confirm' || k === 'wait_user_confirm'
}

/** 微信「确认收款」测试：与后端约定写死（直连商户号 / AppID） */
const WECHAT_WITHDRAW_TEST_MCH_ID = 'your-test-mch-id'
const WECHAT_WITHDRAW_TEST_APP_ID = 'your-test-app-id'

function buildWechatMerchantConfirmUrl(packageInfo: string): string {
  const origin = resolveWechatMerchantConfirmQrOrigin()
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  const pathname = `${base === '/' || base === '' ? '' : base}/wechat-confirm`
  const params = new URLSearchParams()
  params.set('package', packageInfo)
  params.set('mchid', WECHAT_WITHDRAW_TEST_MCH_ID)
  params.set('appid', WECHAT_WITHDRAW_TEST_APP_ID)
  return `${origin}${pathname}?${params.toString()}`
}

const pageWrap =
  'mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-6 overflow-y-auto px-4 py-6 scrollbar-surface md:gap-8 md:px-8 lg:py-8'

const th =
  'align-middle px-3 py-2.5 text-left text-xs font-medium text-zinc-500 md:px-4 md:text-sm'
const td =
  'align-middle border-t border-white/[0.06] px-3 py-2.5 text-xs leading-snug text-zinc-200 md:px-4 md:text-sm'

const panelShell =
  'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-surface-850/80'

type WithdrawLimitDetailBoxProps = {
  readonly minYuan: number | null
  readonly maxYuan: number | null
  readonly cny2: Intl.NumberFormat
  readonly variant?: 'card' | 'modal'
}

/** 单笔提现限额：与接口 `withdraw_min` / `withdraw_max` 对应展示 */
function WithdrawLimitDetailBox({ minYuan, maxYuan, cny2, variant = 'card' }: WithdrawLimitDetailBoxProps) {
  const { t } = useTranslation()
  if (minYuan == null && maxYuan == null) return null
  const shell =
    variant === 'modal'
      ? 'rounded-lg border border-accent/25 bg-accent/[0.07] px-3 py-2.5'
      : 'rounded-lg border border-white/[0.1] bg-black/25 px-3 py-2.5'
  return (
    <div className={shell}>
      <p className="text-xs font-medium text-zinc-400">{t('console.commissionWithdraw.limitDetailTitle')}</p>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        {minYuan != null ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <dt className="text-xs text-zinc-500">{t('console.commissionWithdraw.limitDetailMinLabel')}</dt>
            <dd className="text-sm font-semibold tabular-nums text-zinc-50">{cny2.format(minYuan)}</dd>
          </div>
        ) : null}
        {maxYuan != null ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <dt className="text-xs text-zinc-500">{t('console.commissionWithdraw.limitDetailMaxLabel')}</dt>
            <dd className="text-sm font-semibold tabular-nums text-zinc-50">{cny2.format(maxYuan)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  )
}

type PagerProps = {
  page: number
  total: number
  loading: boolean
  onPageChange: (p: number) => void
}

function WithdrawPager({ page, total, loading, onPageChange }: PagerProps) {
  const { t } = useTranslation()
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const from = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const to = total === 0 ? 0 : Math.min(safePage * PAGE_SIZE, total)

  return (
    <div className="shrink-0 border-t border-white/[0.08] bg-black/20 px-3 py-2.5 backdrop-blur-sm md:px-4">
      <div className="flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
        <p className="text-center text-xs tabular-nums text-zinc-500 sm:text-left">
          {t('console.billing.pagingRange', { from, to, total })}
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={loading || safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('console.billing.pagingPrev')}
          </button>
          <span className="min-w-[4.25rem] rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-center text-xs tabular-nums text-zinc-300">
            {t('console.billing.pagingPage', { current: safePage, pages: totalPages })}
          </span>
          <button
            type="button"
            disabled={loading || safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('console.billing.pagingNext')}
          </button>
        </div>
      </div>
    </div>
  )
}

function parseWithdrawAmountYuan(raw: string): number | null {
  const s = raw.trim().replace(/,/g, '').replace(/，/g, '')
  if (!s) return null
  const n = Number.parseFloat(s)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

/**
 * 提现金额输入：仅保留数字、至多一个小数点、小数最多两位（与 parse 四舍五入到分一致）；
 * 兼容全角数字与小数点、中英文逗号。
 */
function sanitizeWithdrawAmountInput(raw: string): string {
  let s = raw
    .replace(/，/g, '')
    .replace(/,/g, '')
    .replace(/[。．]/g, '.')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))

  let out = ''
  let hasDot = false
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') {
      if (hasDot) {
        const dotIdx = out.indexOf('.')
        if (dotIdx >= 0 && out.length - dotIdx - 1 >= 2) continue
      }
      out += ch
    } else if (ch === '.') {
      if (!hasDot) {
        out += '.'
        hasDot = true
      }
    }
  }
  return out
}

function formatWithdrawalDetailDateTime(raw: string, localeTag: string): string {
  const s = raw.trim()
  if (!s) return '—'
  const ms = Date.parse(s)
  if (!Number.isFinite(ms)) {
    return s.replace('T', ' ').replace(/\.\d{3,}Z?$/i, '').replace(/Z$/i, '').trim()
  }
  return new Date(ms).toLocaleString(localeTag)
}

function withdrawalStatusLabel(t: (k: string) => string, raw: string): string {
  const k = raw.trim().toLowerCase().replace(/\s+/g, '_')
  if (!k || k === '—') return raw
  const key = `console.commissionWithdraw.status.${k}`
  const lbl = t(key)
  return lbl !== key ? lbl : raw
}

/** 提现状态徽章：与接口 `status` 枚举对齐（大小写不敏感） */
function withdrawalStatusBadgeClassName(raw: string): string {
  const k = raw.trim().toLowerCase().replace(/\s+/g, '_')
  const base =
    'inline-flex max-w-full items-center truncate rounded-full border px-2.5 py-0.5 text-xs font-medium'
  switch (k) {
    case 'completed':
    case 'complete':
    case 'success':
    case 'paid':
    case 'succeed':
      return `${base} bg-emerald-500/12 border-emerald-400 text-emerald-400`
    case 'failed':
    case 'rejected':
    case 'error':
    case 'fail':
      return `${base} bg-red-500/10 border-red-400 text-red-400`
    case 'pending':
    case 'processing':
    case 'review':
    case 'auditing':
    case 'pending_user_confirm':
    case 'wait_user_confirm':
      return `${base} bg-amber-500/10 border-amber-400 text-amber-400`
    case 'cancelled':
    case 'canceled':
      return `${base} bg-zinc-500/10 border-zinc-400 text-zinc-400`
    default:
      return `${base} bg-white/[0.06] border-zinc-400 text-zinc-400`
  }
}

export function CommissionWithdrawPage() {
  const { t, i18n } = useTranslation()
  const { token, me, meLoading, refreshMe } = useAuth()
  const localeTag = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'
  const withdrawModalTitleId = useId()
  const withdrawAmountInputId = useId()
  const withdrawAmountErrorId = useId()
  const wechatBindTitleId = useId()
  const wechatWithdrawQrTitleId = useId()
  const reduceMotion = useReducedMotion()

  const isJoinedAgent = isJoinedAgentFromMe(me)

  /** 开发态用 localhost 打开时，二维码里的链接手机无法访问 */
  const wechatWithdrawQrLocalhostRisk = useMemo(
    () => import.meta.env.DEV && isOriginLocalhost(resolveWechatMerchantConfirmQrOrigin()),
    [],
  )

  const [commissionYuan, setCommissionYuan] = useState(0)
  const [balanceLoading, setBalanceLoading] = useState(true)
  const [rows, setRows] = useState<NonNullable<ReturnType<typeof pickWithdrawalTableRow>>[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [listLoading, setListLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailPayload, setDetailPayload] = useState<unknown>(null)

  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false)
  const [withdrawAmountInput, setWithdrawAmountInput] = useState('')
  /** 提现金额输入：校验失败时的文案（飘红）；输入过程防抖校验（不必等失焦） */
  const [withdrawAmountFieldError, setWithdrawAmountFieldError] = useState<string | null>(null)
  const [withdrawalLimits, setWithdrawalLimits] = useState<WithdrawalLimitsYuan>({
    minYuan: null,
    maxYuan: null,
  })

  const [wechatBindModalOpen, setWechatBindModalOpen] = useState(false)
  const [wechatBindQrSrc, setWechatBindQrSrc] = useState<string | null>(null)
  const [wechatWithdrawConfirmOpen, setWechatWithdrawConfirmOpen] = useState(false)
  const [wechatWithdrawQrSrc, setWechatWithdrawQrSrc] = useState<string | null>(null)
  /** 扫码弹窗打开时轮询 `GET /withdrawals/{id}`；来自创建提现接口返回的 id / withdrawal_id */
  const [wechatWithdrawPollId, setWechatWithdrawPollId] = useState<number | null>(null)
  const wechatBindAuthUrlRef = useRef<string | null>(null)
  const wechatWithdrawConfirmUrlRef = useRef<string | null>(null)
  const wechatWithdrawStatusPollRef = useRef<number | null>(null)
  const wechatWithdrawStatusPollBusyRef = useRef(false)
  const pendingWithdrawBodyRef = useRef<WithdrawalRequest | null>(null)
  const wechatPollRef = useRef<number | null>(null)
  /** 避免轮询 tick 重叠执行 */
  const wechatPollTickBusyRef = useRef(false)
  /** 组件已卸载：异步轮询结束后不再 setState */
  const commissionPageMountedRef = useRef(true)
  const detailOpenRef = useRef(false)
  const detailWithdrawalIdRef = useRef<number | null>(null)
  const withdrawAmountValidateTimerRef = useRef<number | null>(null)

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

  const computeWithdrawFieldError = useCallback(
    (raw: string): string | null => {
      const s = raw.trim()
      if (s === '') return null
      const parsed = parseWithdrawAmountYuan(raw)
      if (parsed == null) return t('console.commissionWithdraw.invalidAmount')
      if (parsed > commissionYuan + 1e-6) return t('console.commissionWithdraw.amountExceedsBalance')
      const min = withdrawalLimits.minYuan
      const max = withdrawalLimits.maxYuan
      if (min != null && parsed + 1e-9 < min) {
        return t('console.commissionWithdraw.amountBelowMin', { min: cny2.format(min) })
      }
      if (max != null && parsed - 1e-9 > max) {
        return t('console.commissionWithdraw.amountAboveMax', { max: cny2.format(max) })
      }
      return null
    },
    [commissionYuan, withdrawalLimits.minYuan, withdrawalLimits.maxYuan, cny2, t],
  )

  const clearWithdrawAmountValidateTimer = useCallback(() => {
    const id = withdrawAmountValidateTimerRef.current
    if (id != null) {
      window.clearTimeout(id)
      withdrawAmountValidateTimerRef.current = null
    }
  }, [])

  const scheduleWithdrawAmountValidation = useCallback(
    (raw: string) => {
      clearWithdrawAmountValidateTimer()
      withdrawAmountValidateTimerRef.current = window.setTimeout(() => {
        withdrawAmountValidateTimerRef.current = null
        setWithdrawAmountFieldError(computeWithdrawFieldError(raw))
      }, WITHDRAW_AMOUNT_FIELD_DEBOUNCE_MS)
    },
    [clearWithdrawAmountValidateTimer, computeWithdrawFieldError],
  )

  const loadCommission = useCallback(async () => {
    if (!token || !isJoinedAgent) {
      setCommissionYuan(0)
      setBalanceLoading(false)
      return
    }
    setBalanceLoading(true)
    try {
      const raw = await fetchAccountBalance()
      setCommissionYuan(pickAccountCommissionYuan(raw))
    } catch {
      setCommissionYuan(0)
    } finally {
      setBalanceLoading(false)
    }
  }, [token, isJoinedAgent])

  const loadWithdrawalLimits = useCallback(async () => {
    if (!token || !isJoinedAgent) {
      setWithdrawalLimits({ minYuan: null, maxYuan: null })
      return
    }
    try {
      const lim = await fetchWithdrawalLimits()
      setWithdrawalLimits(lim)
    } catch {
      setWithdrawalLimits({ minYuan: null, maxYuan: null })
      notify.error(t('console.commissionWithdraw.limitsLoadFail'))
    }
  }, [token, isJoinedAgent, t])

  const loadList = useCallback(async () => {
    if (!token || !isJoinedAgent) {
      setRows([])
      setTotal(0)
      setListLoading(false)
      return
    }
    setListLoading(true)
    try {
      const res = await listWithdrawals({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
      const mapped = res.items
        .map((it) => pickWithdrawalTableRow(it))
        .filter((r): r is NonNullable<typeof r> => r != null)
      setRows(mapped)
      setTotal(res.total)
    } catch (e) {
      setRows([])
      setTotal(0)
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('console.commissionWithdraw.loadFail')
      notify.error(msg)
    } finally {
      setListLoading(false)
    }
  }, [token, isJoinedAgent, page, t])

  const stopWechatBindPoll = useCallback(() => {
    if (wechatPollRef.current != null) {
      clearInterval(wechatPollRef.current)
      wechatPollRef.current = null
    }
  }, [])

  const closeWechatBindModal = useCallback(() => {
    stopWechatBindPoll()
    wechatPollTickBusyRef.current = false
    setWechatBindModalOpen(false)
    wechatBindAuthUrlRef.current = null
    setWechatBindQrSrc(null)
    pendingWithdrawBodyRef.current = null
  }, [stopWechatBindPoll])

  const stopWechatWithdrawStatusPoll = useCallback(() => {
    const handle = wechatWithdrawStatusPollRef.current
    if (handle != null) {
      window.clearInterval(handle)
      wechatWithdrawStatusPollRef.current = null
    }
    wechatWithdrawStatusPollBusyRef.current = false
  }, [])

  const closeWechatWithdrawConfirmModal = useCallback(
    (options?: { skipLedgerRefresh?: boolean }) => {
      stopWechatWithdrawStatusPoll()
      setWechatWithdrawPollId(null)
      setWechatWithdrawConfirmOpen(false)
      wechatWithdrawConfirmUrlRef.current = null
      setWechatWithdrawQrSrc(null)
      if (!options?.skipLedgerRefresh) {
        void Promise.all([loadCommission(), loadList()])
      }
    },
    [stopWechatWithdrawStatusPoll, loadCommission, loadList],
  )

  useEffect(() => {
    commissionPageMountedRef.current = true
    return () => {
      commissionPageMountedRef.current = false
      clearWithdrawAmountValidateTimer()
      stopWechatBindPoll()
      wechatPollTickBusyRef.current = false
      stopWechatWithdrawStatusPoll()
    }
  }, [clearWithdrawAmountValidateTimer, stopWechatBindPoll, stopWechatWithdrawStatusPoll])

  /** 弹窗关闭时兜底清除定时器（防止遗漏路径） */
  useEffect(() => {
    if (!wechatBindModalOpen) {
      stopWechatBindPoll()
      wechatPollTickBusyRef.current = false
    }
  }, [wechatBindModalOpen, stopWechatBindPoll])

  useEffect(() => {
    if (!wechatBindModalOpen) {
      setWechatBindQrSrc(null)
      return
    }
    const url = wechatBindAuthUrlRef.current
    if (!url) {
      setWechatBindQrSrc(null)
      return
    }
    let cancelled = false
    void QRCode.toDataURL(url, {
      width: 220,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((src) => {
        if (!cancelled) setWechatBindQrSrc(src)
      })
      .catch(() => {
        if (!cancelled) setWechatBindQrSrc(null)
      })
    return () => {
      cancelled = true
    }
  }, [wechatBindModalOpen])

  useEffect(() => {
    if (!wechatWithdrawConfirmOpen) {
      setWechatWithdrawQrSrc(null)
      return
    }
    const url = wechatWithdrawConfirmUrlRef.current
    if (!url) {
      setWechatWithdrawQrSrc(null)
      return
    }
    let cancelled = false
    void QRCode.toDataURL(url, {
      width: 240,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((src) => {
        if (!cancelled) setWechatWithdrawQrSrc(src)
      })
      .catch(() => {
        if (!cancelled) setWechatWithdrawQrSrc(null)
      })
    return () => {
      cancelled = true
    }
  }, [wechatWithdrawConfirmOpen])

  useEffect(() => {
    if (!wechatBindModalOpen) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') closeWechatBindModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [wechatBindModalOpen, closeWechatBindModal])

  useEffect(() => {
    void loadCommission()
  }, [loadCommission])

  useEffect(() => {
    void loadWithdrawalLimits()
  }, [loadWithdrawalLimits])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    if (!wechatWithdrawConfirmOpen) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') closeWechatWithdrawConfirmModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [wechatWithdrawConfirmOpen, closeWechatWithdrawConfirmModal])

  useEffect(() => {
    if (!wechatWithdrawConfirmOpen || wechatWithdrawPollId == null || !token) {
      stopWechatWithdrawStatusPoll()
      return
    }
    /** 本 effect 实例是否已卸载 / 已被下一轮 effect 取代；await 后必须再检查 */
    let pollEffectAlive = true
    const id = wechatWithdrawPollId

    /** 先清再启，避免 deps 抖动或 Strict 双调留下重复 interval */
    stopWechatWithdrawStatusPoll()

    const tick = async () => {
      if (!pollEffectAlive || !commissionPageMountedRef.current) return
      if (wechatWithdrawStatusPollBusyRef.current) return
      wechatWithdrawStatusPollBusyRef.current = true
      try {
        const raw = await getWithdrawal(id)
        if (!pollEffectAlive || !commissionPageMountedRef.current) return
        const parsed = parseWithdrawalDetailPayload(raw)
        const statusRaw = parsed?.statusRaw ?? ''
        if (isWithdrawalStatusCompleted(statusRaw)) {
          stopWechatWithdrawStatusPoll()
          if (!pollEffectAlive || !commissionPageMountedRef.current) return
          closeWechatWithdrawConfirmModal({ skipLedgerRefresh: true })
          notify.success(t('console.commissionWithdraw.wechatWithdrawPollCompleted'))
          await Promise.all([loadCommission(), loadList()])
          if (
            detailOpenRef.current &&
            detailWithdrawalIdRef.current === id &&
            commissionPageMountedRef.current
          ) {
            try {
              const fresh = await getWithdrawal(id)
              if (commissionPageMountedRef.current) setDetailPayload(fresh)
            } catch {
              /* ignore */
            }
          }
        } else if (isWithdrawalStatusTerminalFailed(statusRaw)) {
          stopWechatWithdrawStatusPoll()
          if (!pollEffectAlive || !commissionPageMountedRef.current) return
          setWechatWithdrawPollId(null)
          notify.error(
            t('console.commissionWithdraw.wechatWithdrawPollTerminalFail', { status: statusRaw || '—' }),
          )
          if (
            detailOpenRef.current &&
            detailWithdrawalIdRef.current === id &&
            commissionPageMountedRef.current
          ) {
            try {
              const fresh = await getWithdrawal(id)
              if (commissionPageMountedRef.current) setDetailPayload(fresh)
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* 单次查询失败忽略 */
      } finally {
        wechatWithdrawStatusPollBusyRef.current = false
      }
    }

    void tick()
    wechatWithdrawStatusPollRef.current = window.setInterval(() => {
      void tick()
    }, WITHDRAWAL_POLL_MS)

    return () => {
      pollEffectAlive = false
      stopWechatWithdrawStatusPoll()
    }
  }, [
    wechatWithdrawConfirmOpen,
    wechatWithdrawPollId,
    token,
    stopWechatWithdrawStatusPoll,
    closeWechatWithdrawConfirmModal,
    t,
    loadCommission,
    loadList,
  ])

  const openDetail = async (id: number) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailPayload(null)
    try {
      const data = await getWithdrawal(id)
      setDetailPayload(data)
    } catch (e) {
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('console.commissionWithdraw.detailFail')
      notify.error(msg)
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetailOpen(false)
    setDetailPayload(null)
  }

  const openWithdrawModal = () => {
    if (commissionYuan <= 0) {
      notify.error(t('console.commissionWithdraw.withdrawNoBalance'))
      return
    }
    const min = withdrawalLimits.minYuan
    if (min != null && commissionYuan + 1e-9 < min) {
      notify.error(t('console.commissionWithdraw.balanceBelowMinLimit', { min: cny2.format(min) }))
      return
    }
    clearWithdrawAmountValidateTimer()
    setWithdrawAmountInput('')
    setWithdrawAmountFieldError(null)
    setWithdrawModalOpen(true)
  }

  const closeWithdrawModal = useCallback(() => {
    clearWithdrawAmountValidateTimer()
    setWithdrawModalOpen(false)
    setWithdrawAmountFieldError(null)
  }, [clearWithdrawAmountValidateTimer])

  useEffect(() => {
    if (!withdrawModalOpen) return
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') closeWithdrawModal()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [withdrawModalOpen, closeWithdrawModal])

  const runWechatBindPollTick = useCallback(async () => {
    const body = pendingWithdrawBodyRef.current
    if (!body || !token) return
    if (wechatPollTickBusyRef.current) return
    wechatPollTickBusyRef.current = true
    try {
      const raw = await fetchCurrentUser()
      if (!commissionPageMountedRef.current) return
      if (!pickWechatServiceBoundFromUserRaw(raw)) return
      stopWechatBindPoll()
      if (!commissionPageMountedRef.current) return
      setWechatBindModalOpen(false)
      wechatBindAuthUrlRef.current = null
      setWechatBindQrSrc(null)
      await refreshMe()
      if (!commissionPageMountedRef.current) return
      notify.success(t('console.commissionWithdraw.wechatBindSuccess'))
      try {
        const data = await createWechatWithdrawal(body)
        if (!commissionPageMountedRef.current) return
        const pkg = pickWithdrawalPackageInfo(data)
        if (!pkg) {
          notify.error(t('console.commissionWithdraw.wechatWithdrawMissingPackage'))
          pendingWithdrawBodyRef.current = null
          return
        }
        const wid = pickWithdrawalIdFromPayload(data)
        setWechatWithdrawPollId(wid)
        if (wid == null) {
          notify.info(t('console.commissionWithdraw.wechatWithdrawNoPollId'))
        }
        const confirmUrl = buildWechatMerchantConfirmUrl(pkg)
        wechatWithdrawConfirmUrlRef.current = confirmUrl
        pendingWithdrawBodyRef.current = null
        setWechatWithdrawConfirmOpen(true)
        notify.success(t('console.commissionWithdraw.wechatWithdrawSubmitted'))
      } catch (e2) {
        if (!commissionPageMountedRef.current) return
        pendingWithdrawBodyRef.current = null
        const msg2 =
          e2 instanceof NexusBizError
            ? e2.message
            : e2 instanceof Error
              ? e2.message
              : t('console.commissionWithdraw.withdrawFail')
        notify.error(msg2)
      }
    } catch {
      /* 单次轮询失败忽略 */
    } finally {
      wechatPollTickBusyRef.current = false
    }
  }, [token, stopWechatBindPoll, refreshMe, t])

  const startWechatBindPolling = useCallback(() => {
    stopWechatBindPoll()
    wechatPollRef.current = window.setInterval(() => {
      void runWechatBindPollTick()
    }, 2500)
    void runWechatBindPollTick()
  }, [runWechatBindPollTick, stopWechatBindPoll])

  const fillWithdrawAll = () => {
    if (commissionYuan <= 0) return
    clearWithdrawAmountValidateTimer()
    let cap = commissionYuan
    const max = withdrawalLimits.maxYuan
    if (max != null) cap = Math.min(cap, max)
    const s = cap.toFixed(2)
    setWithdrawAmountInput(s)
    setWithdrawAmountFieldError(computeWithdrawFieldError(s))
  }

  const submitWithdrawFromModal = async () => {
    if (!token) return
    clearWithdrawAmountValidateTimer()
    const parsed = parseWithdrawAmountYuan(withdrawAmountInput)
    if (parsed == null) {
      const msg = t('console.commissionWithdraw.invalidAmount')
      setWithdrawAmountFieldError(msg)
      notify.error(msg)
      return
    }
    if (parsed > commissionYuan + 1e-6) {
      const msg = t('console.commissionWithdraw.amountExceedsBalance')
      setWithdrawAmountFieldError(msg)
      notify.error(msg)
      return
    }
    const min = withdrawalLimits.minYuan
    const max = withdrawalLimits.maxYuan
    if (min != null && parsed + 1e-9 < min) {
      const msg = t('console.commissionWithdraw.amountBelowMin', { min: cny2.format(min) })
      setWithdrawAmountFieldError(msg)
      notify.error(msg)
      return
    }
    if (max != null && parsed - 1e-9 > max) {
      const msg = t('console.commissionWithdraw.amountAboveMax', { max: cny2.format(max) })
      setWithdrawAmountFieldError(msg)
      notify.error(msg)
      return
    }
    const body: WithdrawalRequest = { amount: parsed, bank_account: '' }
    setSubmitting(true)
    try {
      const data = await createWechatWithdrawal(body)
      const pkg = pickWithdrawalPackageInfo(data)
      if (!pkg) {
        notify.error(t('console.commissionWithdraw.wechatWithdrawMissingPackage'))
        return
      }
      const wid = pickWithdrawalIdFromPayload(data)
      setWechatWithdrawPollId(wid)
      if (wid == null) {
        notify.info(t('console.commissionWithdraw.wechatWithdrawNoPollId'))
      }
      const confirmUrl = buildWechatMerchantConfirmUrl(pkg)
      wechatWithdrawConfirmUrlRef.current = confirmUrl
      closeWithdrawModal()
      setWithdrawAmountInput('')
      setWithdrawAmountFieldError(null)
      setWechatWithdrawConfirmOpen(true)
      notify.success(t('console.commissionWithdraw.wechatWithdrawSubmitted'))
    } catch (e) {
      const bindUrl = extractWechatServiceBindAuthUrl(e)
      if (bindUrl) {
        const tip =
          e instanceof NexusBizError
            ? e.message
            : t('console.commissionWithdraw.wechatBindModalTitle')
        notify.error(tip)
        pendingWithdrawBodyRef.current = body
        wechatBindAuthUrlRef.current = bindUrl
        closeWithdrawModal()
        setWechatBindModalOpen(true)
        startWechatBindPolling()
        return
      }
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('console.commissionWithdraw.withdrawFail')
      notify.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const withdrawalDetailParsed = useMemo(
    () => parseWithdrawalDetailPayload(detailPayload),
    [detailPayload],
  )

  useEffect(() => {
    detailOpenRef.current = detailOpen
  }, [detailOpen])

  useEffect(() => {
    detailWithdrawalIdRef.current = withdrawalDetailParsed?.id ?? null
  }, [withdrawalDetailParsed?.id])

  const openWechatConfirmFromDetail = useCallback(() => {
    if (!withdrawalDetailParsed?.packageInfo) {
      notify.error(t('console.commissionWithdraw.wechatWithdrawMissingPackage'))
      return
    }
    const wid = withdrawalDetailParsed.id
    if (wid != null && wid > 0) {
      setWechatWithdrawPollId(wid)
    } else {
      setWechatWithdrawPollId(null)
      notify.info(t('console.commissionWithdraw.wechatWithdrawNoPollId'))
    }
    wechatWithdrawConfirmUrlRef.current = buildWechatMerchantConfirmUrl(withdrawalDetailParsed.packageInfo)
    setWechatWithdrawConfirmOpen(true)
    notify.success(t('console.commissionWithdraw.wechatWithdrawSubmitted'))
  }, [withdrawalDetailParsed, t])

  if (!token) {
    return null
  }

  if (meLoading) {
    return (
      <div className={`${pageWrap} justify-center`}>
        <p className="text-center text-sm text-zinc-500">{t('console.common.loading')}</p>
      </div>
    )
  }

  if (!isJoinedAgent) {
    return (
      <div className={`${pageWrap} justify-center`}>
        <div className="mx-auto max-w-lg rounded-xl border border-white/[0.08] bg-surface-850/80 p-6 text-center">
          <p className="text-sm text-zinc-300">{t('console.commissionWithdraw.agentOnly')}</p>
          <Link
            to="/partners"
            className="mt-4 inline-flex rounded-full border border-white/[0.14] bg-white/[0.06] px-5 py-2 text-sm font-medium text-zinc-100 transition hover:bg-white/[0.1]"
          >
            {t('console.commissionWithdraw.goPartners')}
          </Link>
        </div>
      </div>
    )
  }

  const initialSpinner = listLoading && rows.length === 0 && page === 1
  const empty = !listLoading && total === 0

  return (
    <div className={pageWrap}>
      <section className="rounded-xl border border-white/[0.08] bg-surface-850/90 p-5 md:p-6">
        <p className="text-sm text-zinc-400">{t('console.commissionWithdraw.balanceLabel')}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums text-white">
          {balanceLoading ? '…' : cny2.format(commissionYuan)}
        </p>
        <div className="mt-4">
          <WithdrawLimitDetailBox
            variant="card"
            minYuan={withdrawalLimits.minYuan}
            maxYuan={withdrawalLimits.maxYuan}
            cny2={cny2}
          />
        </div>
        <div className="mt-5">
          <button
            type="button"
            disabled={
              balanceLoading ||
              commissionYuan <= 0 ||
              (withdrawalLimits.minYuan != null &&
                commissionYuan + 1e-9 < withdrawalLimits.minYuan)
            }
            onClick={openWithdrawModal}
            className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('console.commissionWithdraw.withdraw')}
          </button>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <h3 className="shrink-0 text-sm font-semibold text-zinc-200">{t('console.commissionWithdraw.recordsTitle')}</h3>
        <div className={panelShell}>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {initialSpinner ? (
              <div className="flex min-h-[12rem] flex-1 items-center justify-center px-4 py-8 text-sm text-zinc-500">
                {t('console.common.loading')}
              </div>
            ) : empty ? (
              <div className="flex min-h-[12rem] flex-1 items-center justify-center px-4 py-8 text-sm text-zinc-500">
                {t('console.commissionWithdraw.emptyRecords')}
              </div>
            ) : (
              <div
                className={`scrollbar-surface min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-gutter:stable] ${listLoading ? 'pointer-events-none opacity-60' : ''}`}
              >
                <table className="w-full min-w-[56rem] border-collapse text-left">
                  <thead>
                    <tr className="sticky top-0 z-[1] border-b border-white/[0.08] bg-surface-850/95 backdrop-blur-sm">
                      <th className={th}>{t('console.commissionWithdraw.colBankAccount')}</th>
                      <th className={th}>{t('console.commissionWithdraw.colAmount')}</th>
                      <th className={th}>{t('console.commissionWithdraw.colStatus')}</th>
                      <th className={th}>{t('console.commissionWithdraw.colOutBatchNo')}</th>
                      <th className={th}>{t('console.commissionWithdraw.colTransferBillNo')}</th>
                      <th className={th}>{t('console.commissionWithdraw.colFailureReason')}</th>
                      <th className={th}>{t('console.commissionWithdraw.colCreated')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer transition hover:bg-white/[0.03]"
                        onClick={() => void openDetail(r.id)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault()
                            void openDetail(r.id)
                          }
                        }}
                      >
                        <td className={`${td} max-w-[min(14rem,36vw)] truncate text-zinc-300`}>
                          {r.bankAccount
                            ? r.bankAccount
                            : t('console.commissionWithdraw.bankAccountWechatDefault')}
                        </td>
                        <td className={`${td} tabular-nums`}>{cny2.format(r.amountYuan)}</td>
                        <td className={td}>
                          <span
                            className={withdrawalStatusBadgeClassName(r.statusRaw)}
                            title={r.statusRaw}
                          >
                            {withdrawalStatusLabel(t, r.statusRaw)}
                          </span>
                        </td>
                        <td
                          className={`${td} max-w-[10rem] truncate font-mono text-[11px] text-zinc-400`}
                          title={r.outBatchNo || undefined}
                        >
                          {r.outBatchNo || '—'}
                        </td>
                        <td
                          className={`${td} max-w-[10rem] truncate font-mono text-[11px] text-zinc-400`}
                          title={r.transferBillNo || undefined}
                        >
                          {r.transferBillNo || '—'}
                        </td>
                        <td
                          className={`${td} max-w-[min(12rem,22vw)] truncate text-zinc-400`}
                          title={r.failureReason || undefined}
                        >
                          {r.failureReason || '—'}
                        </td>
                        <td className={`${td} text-zinc-500`}>{r.createdAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <WithdrawPager page={page} total={total} loading={listLoading} onPageChange={setPage} />
        </div>
      </section>

      {withdrawModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeWithdrawModal()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={withdrawModalTitleId}
            className="relative w-full max-w-md rounded-2xl border border-white/[0.1] bg-surface-850 p-6 shadow-2xl shadow-black/40"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
              aria-label={t('console.common.close')}
              onClick={closeWithdrawModal}
            >
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
            </button>
            <h2 id={withdrawModalTitleId} className="pr-10 text-lg font-semibold text-zinc-100">
              {t('console.commissionWithdraw.modalTitle')}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {t('console.commissionWithdraw.modalHint', { amount: cny2.format(commissionYuan) })}
            </p>
            <div className="mt-3">
              <WithdrawLimitDetailBox
                variant="modal"
                minYuan={withdrawalLimits.minYuan}
                maxYuan={withdrawalLimits.maxYuan}
                cny2={cny2}
              />
            </div>
            <label className="mt-5 block text-xs font-medium text-zinc-400" htmlFor={withdrawAmountInputId}>
              {t('console.commissionWithdraw.amountLabel')}
              <input
                id={withdrawAmountInputId}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={withdrawAmountInput}
                onChange={(e) => {
                  const v = sanitizeWithdrawAmountInput(e.target.value)
                  setWithdrawAmountInput(v)
                  if (v.trim() === '') {
                    clearWithdrawAmountValidateTimer()
                    setWithdrawAmountFieldError(null)
                    return
                  }
                  scheduleWithdrawAmountValidation(v)
                }}
                onBlur={() => {
                  clearWithdrawAmountValidateTimer()
                  setWithdrawAmountFieldError(computeWithdrawFieldError(withdrawAmountInput))
                }}
                placeholder={t('console.commissionWithdraw.amountPlaceholder')}
                aria-invalid={withdrawAmountFieldError != null}
                aria-describedby={withdrawAmountFieldError ? withdrawAmountErrorId : undefined}
                className={`mt-1.5 w-full rounded-lg border bg-surface-950/80 px-3 py-2 text-base text-zinc-100 outline-none placeholder:text-zinc-600 md:text-sm ${
                  withdrawAmountFieldError != null
                    ? 'border-red-400/55 ring-1 ring-red-400/25 focus:border-red-400/65 focus:ring-2 focus:ring-red-400/20'
                    : 'border-white/[0.1] ring-accent/40 focus:border-accent/40 focus:ring-2'
                }`}
                disabled={submitting}
              />
              {withdrawAmountFieldError ? (
                <p id={withdrawAmountErrorId} role="alert" className="mt-1.5 text-xs leading-snug text-red-400">
                  {withdrawAmountFieldError}
                </p>
              ) : null}
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={submitting || commissionYuan <= 0}
                onClick={fillWithdrawAll}
                className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('console.commissionWithdraw.withdrawAll')}
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={closeWithdrawModal}
                className="rounded-full px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
              >
                {t('console.commissionWithdraw.cancelWithdraw')}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitWithdrawFromModal()}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? t('console.common.loading') : t('console.commissionWithdraw.submitWithdraw')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {wechatBindModalOpen ? (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeWechatBindModal()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={wechatBindTitleId}
            className="relative w-full max-w-sm rounded-2xl border border-white/[0.1] bg-surface-850 p-6 shadow-2xl shadow-black/40"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
              aria-label={t('console.common.close')}
              onClick={closeWechatBindModal}
            >
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
            </button>
            <h2 id={wechatBindTitleId} className="pr-10 text-lg font-semibold text-zinc-100">
              {t('console.commissionWithdraw.wechatBindModalTitle')}
            </h2>
            <p className="mt-2 text-sm text-zinc-500">{t('console.commissionWithdraw.wechatBindModalHint')}</p>
            <div className="mt-5 flex flex-col items-center">
              {wechatBindQrSrc ? (
                <img
                  src={wechatBindQrSrc}
                  alt=""
                  className="h-[220px] w-[220px] rounded-lg border border-white/[0.08] bg-white p-2"
                />
              ) : (
                <div className="flex h-[220px] w-[220px] items-center justify-center rounded-lg border border-white/[0.08] bg-surface-950/60 text-sm text-zinc-500">
                  {t('console.common.loading')}
                </div>
              )}
            </div>
            <p className="mt-3 text-center text-xs text-zinc-500">
              {t('console.commissionWithdraw.wechatBindQrCaption')}
            </p>
          </div>
        </div>
      ) : null}

      {wechatWithdrawConfirmOpen ? (
        <div
          className="fixed inset-0 z-[66] flex items-center justify-center bg-black/60 px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeWechatWithdrawConfirmModal()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={wechatWithdrawQrTitleId}
            className="relative w-full max-w-sm rounded-2xl border border-white/[0.1] bg-surface-850 p-6 shadow-2xl shadow-black/40"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
              aria-label={t('console.common.close')}
              onClick={() => closeWechatWithdrawConfirmModal()}
            >
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
            </button>
            <h2 id={wechatWithdrawQrTitleId} className="pr-10 text-lg font-semibold text-zinc-100">
              {t('console.commissionWithdraw.wechatWithdrawQrTitle')}
            </h2>
            <p className="mt-2 text-sm text-zinc-500">{t('console.commissionWithdraw.wechatWithdrawQrHint')}</p>
            {wechatWithdrawQrLocalhostRisk ? (
              <p className="mt-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100/95">
                {t('console.commissionWithdraw.wechatWithdrawLocalhostWarn')}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col items-center">
              {wechatWithdrawQrSrc ? (
                <img
                  src={wechatWithdrawQrSrc}
                  alt=""
                  className="h-[240px] w-[240px] rounded-lg border border-white/[0.08] bg-white p-2"
                />
              ) : (
                <div className="flex h-[240px] w-[240px] items-center justify-center rounded-lg border border-white/[0.08] bg-surface-950/60 text-sm text-zinc-500">
                  {t('console.common.loading')}
                </div>
              )}
            </div>
            <p className="mt-3 text-center text-xs text-zinc-500">
              {import.meta.env.DEV
                ? t('console.commissionWithdraw.wechatWithdrawQrCaption')
                : t('console.commissionWithdraw.wechatWithdrawQrCaptionProd')}
            </p>
          </div>
        </div>
      ) : null}

      <AnimatePresence>
        {detailOpen ? (
          <motion.div
            key="withdrawal-detail-overlay"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:p-4"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeDetail()
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              className="relative max-h-[min(100dvh-1rem,640px)] w-full max-w-lg overflow-y-auto overscroll-y-contain rounded-2xl border border-white/[0.1] bg-surface-850 p-5 shadow-2xl shadow-black/40"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 420, damping: 34 }
              }
              onMouseDown={(e) => e.stopPropagation()}
            >
            <button
              type="button"
              className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
              aria-label={t('console.common.close')}
              onClick={closeDetail}
            >
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
            </button>
            <h3 className="pr-10 text-base font-semibold text-zinc-100">{t('console.commissionWithdraw.detailTitle')}</h3>
            {detailLoading ? (
              <p className="mt-4 text-sm text-zinc-500">{t('console.common.loading')}</p>
            ) : withdrawalDetailParsed ? (
              <>
              <dl className="mt-4 space-y-0 divide-y divide-white/[0.06] rounded-lg border border-white/[0.08] bg-surface-950/40 px-4 py-1">
                <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <dt className="shrink-0 text-xs font-medium text-zinc-500">
                    {t('console.commissionWithdraw.detailLabelAmount')}
                  </dt>
                  <dd className="min-w-0 text-sm font-medium tabular-nums text-zinc-100 sm:text-right">
                    {cny2.format(withdrawalDetailParsed.amountYuan)}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <dt className="shrink-0 text-xs font-medium text-zinc-500">
                    {t('console.commissionWithdraw.detailLabelBankAccount')}
                  </dt>
                  <dd className="min-w-0 break-all text-sm text-zinc-100 sm:text-right">
                    {withdrawalDetailParsed.bankAccount
                      ? withdrawalDetailParsed.bankAccount
                      : t('console.commissionWithdraw.bankAccountWechatDefault')}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <dt className="shrink-0 text-xs font-medium text-zinc-500">
                    {t('console.commissionWithdraw.detailLabelStatus')}
                  </dt>
                  <dd className="min-w-0 text-sm text-zinc-100 sm:text-right">
                    <span
                      className={withdrawalStatusBadgeClassName(withdrawalDetailParsed.statusRaw)}
                      title={withdrawalDetailParsed.statusRaw}
                    >
                      {withdrawalStatusLabel(t, withdrawalDetailParsed.statusRaw)}
                    </span>
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <dt className="shrink-0 text-xs font-medium text-zinc-500">
                    {t('console.commissionWithdraw.detailLabelOutBatchNo')}
                  </dt>
                  <dd className="min-w-0 break-all font-mono text-[13px] text-zinc-100 sm:text-right">
                    {withdrawalDetailParsed.outBatchNo || '—'}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <dt className="shrink-0 text-xs font-medium text-zinc-500">
                    {t('console.commissionWithdraw.detailLabelTransferBillNo')}
                  </dt>
                  <dd className="min-w-0 break-all font-mono text-[13px] text-zinc-100 sm:text-right">
                    {withdrawalDetailParsed.transferBillNo || '—'}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <dt className="shrink-0 text-xs font-medium text-zinc-500">
                    {t('console.commissionWithdraw.detailLabelFailureReason')}
                  </dt>
                  <dd className="min-w-0 break-words text-sm text-zinc-100 sm:text-right">
                    {withdrawalDetailParsed.failureReason || '—'}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <dt className="shrink-0 text-xs font-medium text-zinc-500">
                    {t('console.commissionWithdraw.detailLabelCreated')}
                  </dt>
                  <dd className="min-w-0 text-sm tabular-nums text-zinc-300 sm:text-right">
                    {formatWithdrawalDetailDateTime(withdrawalDetailParsed.createdRaw, localeTag)}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <dt className="shrink-0 text-xs font-medium text-zinc-500">
                    {t('console.commissionWithdraw.detailLabelUpdated')}
                  </dt>
                  <dd className="min-w-0 text-sm tabular-nums text-zinc-300 sm:text-right">
                    {formatWithdrawalDetailDateTime(withdrawalDetailParsed.updatedRaw, localeTag)}
                  </dd>
                </div>
              </dl>
              {isWithdrawalPendingUserConfirm(withdrawalDetailParsed.statusRaw) &&
              withdrawalDetailParsed.packageInfo ? (
                <div className="mt-4 flex flex-col gap-2 border-t border-white/[0.08] pt-4">
                  <button
                    type="button"
                    onClick={() => void openWechatConfirmFromDetail()}
                    className="w-full rounded-xl bg-white px-4 py-2.5 text-center text-sm font-medium text-black transition hover:bg-zinc-100 sm:w-auto sm:self-end"
                  >
                    {t('console.commissionWithdraw.detailConfirmWechatReceipt')}
                  </button>
                  <p className="text-xs text-zinc-500">
                    {t('console.commissionWithdraw.detailConfirmWechatReceiptHint')}
                  </p>
                </div>
              ) : isWithdrawalPendingUserConfirm(withdrawalDetailParsed.statusRaw) &&
                !withdrawalDetailParsed.packageInfo ? (
                <p className="mt-4 text-xs text-amber-200/90">
                  {t('console.commissionWithdraw.detailPendingNoPackage')}
                </p>
              ) : null}
              </>
            ) : (
              <pre className="mt-4 max-h-[min(60vh,28rem)] overflow-auto rounded-lg border border-white/[0.08] bg-surface-950/80 p-3 text-left font-mono text-[11px] leading-relaxed text-zinc-300">
                {detailPayload != null
                  ? typeof detailPayload === 'object'
                    ? JSON.stringify(safeRecord(detailPayload), null, 2)
                    : String(detailPayload)
                  : '—'}
              </pre>
            )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
