import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listOrders } from '@/api/nexus/orders'
import { fetchAccountTransactions } from '@/api/nexus/account'
import { pickOrderRow, pickTransactionRow } from '@/api/mappers/console'
import { NexusBizError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { normalizeOrderStatusKey, orderStatusBadgeClassName } from '@/lib/orderStatus'
import {
  accountTransactionTypeBadgeClassName,
  normalizeAccountTransactionTypeKey,
} from '@/lib/transactionType'
import { notify } from '@/lib/toast'

const PAGE_SIZE = 5

const pageWrap =
  'mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4 overflow-y-auto px-4 py-6 scrollbar-surface md:gap-5 md:px-8 lg:py-8'

const th =
  'align-middle px-3 py-2.5 text-left text-xs font-medium text-zinc-500 md:px-4 md:text-sm'
const td =
  'align-middle border-t border-white/[0.06] px-3 py-2.5 text-xs leading-snug text-zinc-200 md:px-4 md:text-sm'

const panelShell =
  'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-surface-850/80'

type BillingPagerProps = {
  page: number
  total: number
  loading: boolean
  onPageChange: (p: number) => void
}

function BillingPager({ page, total, loading, onPageChange }: BillingPagerProps) {
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

export function BillingPage() {
  const { t, i18n } = useTranslation()
  const { token } = useAuth()
  const [orders, setOrders] = useState<ReturnType<typeof pickOrderRow>[]>([])
  const [ordersTotal, setOrdersTotal] = useState(0)
  const [ordersPage, setOrdersPage] = useState(1)
  const [ordersLoading, setOrdersLoading] = useState(true)

  const [txs, setTxs] = useState<ReturnType<typeof pickTransactionRow>[]>([])
  const [txsTotal, setTxsTotal] = useState(0)
  const [txsPage, setTxsPage] = useState(1)
  const [txsLoading, setTxsLoading] = useState(true)

  const loadOrders = useCallback(async () => {
    if (!token) {
      setOrders([])
      setOrdersTotal(0)
      setOrdersLoading(false)
      return
    }
    setOrdersLoading(true)
    try {
      const o = await listOrders({
        limit: PAGE_SIZE,
        offset: (ordersPage - 1) * PAGE_SIZE,
      })
      setOrders(o.items.map((it) => pickOrderRow(it)))
      setOrdersTotal(o.total)
    } catch (e) {
      setOrders([])
      setOrdersTotal(0)
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('console.billing.loadFail')
      notify.error(msg)
    } finally {
      setOrdersLoading(false)
    }
  }, [token, ordersPage, t])

  const loadTxs = useCallback(async () => {
    if (!token) {
      setTxs([])
      setTxsTotal(0)
      setTxsLoading(false)
      return
    }
    setTxsLoading(true)
    try {
      const tr = await fetchAccountTransactions({
        limit: PAGE_SIZE,
        offset: (txsPage - 1) * PAGE_SIZE,
      })
      setTxs(tr.items.map((it) => pickTransactionRow(it)))
      setTxsTotal(tr.total)
    } catch (e) {
      setTxs([])
      setTxsTotal(0)
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('console.billing.loadFail')
      notify.error(msg)
    } finally {
      setTxsLoading(false)
    }
  }, [token, txsPage, t])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  useEffect(() => {
    void loadTxs()
  }, [loadTxs])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(ordersTotal / PAGE_SIZE))
    if (ordersPage > maxPage) setOrdersPage(maxPage)
  }, [ordersTotal, ordersPage])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(txsTotal / PAGE_SIZE))
    if (txsPage > maxPage) setTxsPage(maxPage)
  }, [txsTotal, txsPage])

  useEffect(() => {
    if (!token) {
      setOrdersPage(1)
      setTxsPage(1)
    }
  }, [token])

  const orderStatusLabel = (raw: string) => {
    const k = normalizeOrderStatusKey(raw)
    return k ? t(`console.billing.orderStatus.${k}`) : raw || '—'
  }

  const transactionTypeLabel = (raw: string) => {
    const k = normalizeAccountTransactionTypeKey(raw)
    return k ? t(`console.billing.txType.${k}`) : raw || '—'
  }

  const transactionAccountTypeLabel = (raw: string) => {
    const trimmed = String(raw ?? '').trim()
    if (!trimmed || trimmed === '—') return trimmed || '—'
    const k = trimmed.toLowerCase()
    const full = `console.billing.txAccountType.${k}`
    return i18n.exists(full) ? t(full) : raw
  }

  const orderTypeLabel = (raw: string) => {
    const trimmed = String(raw ?? '').trim()
    if (!trimmed || trimmed === '—') return trimmed || '—'
    const k = trimmed.toLowerCase()
    const full = `console.billing.orderType.${k}`
    return i18n.exists(full) ? t(full) : raw
  }

  const paymentMethodLabel = (raw: string) => {
    const trimmed = String(raw ?? '').trim()
    if (!trimmed || trimmed === '—') return trimmed || '—'
    const k = trimmed.toLowerCase()
    const full = `console.billing.paymentMethod.${k}`
    return i18n.exists(full) ? t(full) : raw
  }

  const txYuan = (s: string) => (s === '—' ? '—' : `¥${s}`)

  const ordersInitialSpinner = ordersLoading && orders.length === 0 && ordersPage === 1
  const ordersEmpty = !ordersLoading && ordersTotal === 0
  const txsInitialSpinner = txsLoading && txs.length === 0 && txsPage === 1
  const txsEmpty = !txsLoading && txsTotal === 0

  return (
    <div className={pageWrap}>
      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <h3 className="shrink-0 text-sm font-semibold text-zinc-200">{t('console.billing.ordersTitle')}</h3>
        <div className={panelShell}>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {ordersInitialSpinner ? (
                <div className="scrollbar-surface flex min-h-0 flex-1 flex-col overflow-x-auto">
                  <table className="w-full min-w-[56rem] shrink-0 border-collapse text-left">
                    <thead>
                      <tr className="border-b border-white/[0.08] bg-surface-850/95 backdrop-blur-sm">
                        <th className={th}>{t('console.billing.colOrderId')}</th>
                        <th className={th}>{t('console.billing.colStatus')}</th>
                        <th className={th}>{t('console.billing.colOrderType')}</th>
                        <th className={th}>{t('console.billing.colPaymentMethod')}</th>
                        <th className={th}>{t('console.billing.colTransactionId')}</th>
                        <th className={th}>{t('console.billing.colAmount')}</th>
                        <th className={th}>{t('console.billing.colCreatedAt')}</th>
                      </tr>
                    </thead>
                  </table>
                  <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 text-sm text-zinc-500">
                    {t('console.common.loading')}
                  </div>
                </div>
              ) : ordersEmpty ? (
                <div className="scrollbar-surface flex min-h-0 flex-1 flex-col overflow-x-auto">
                  <table className="w-full min-w-[56rem] shrink-0 border-collapse text-left">
                    <thead>
                      <tr className="border-b border-white/[0.08] bg-surface-850/95 backdrop-blur-sm">
                        <th className={th}>{t('console.billing.colOrderId')}</th>
                        <th className={th}>{t('console.billing.colStatus')}</th>
                        <th className={th}>{t('console.billing.colOrderType')}</th>
                        <th className={th}>{t('console.billing.colPaymentMethod')}</th>
                        <th className={th}>{t('console.billing.colTransactionId')}</th>
                        <th className={th}>{t('console.billing.colAmount')}</th>
                        <th className={th}>{t('console.billing.colCreatedAt')}</th>
                      </tr>
                    </thead>
                  </table>
                  <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 text-sm text-zinc-500">
                    {t('console.billing.emptyRecharge')}
                  </div>
                </div>
              ) : (
                <div
                  className={`scrollbar-surface min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-gutter:stable] ${ordersLoading ? 'pointer-events-none opacity-50' : ''}`}
                >
                  <table className="w-full min-w-[56rem] border-collapse text-left">
                    <thead>
                      <tr className="sticky top-0 z-[1] border-b border-white/[0.08] bg-surface-850/95 backdrop-blur-sm">
                        <th className={th}>{t('console.billing.colOrderId')}</th>
                        <th className={th}>{t('console.billing.colStatus')}</th>
                        <th className={th}>{t('console.billing.colOrderType')}</th>
                        <th className={th}>{t('console.billing.colPaymentMethod')}</th>
                        <th className={th}>{t('console.billing.colTransactionId')}</th>
                        <th className={th}>{t('console.billing.colAmount')}</th>
                        <th className={th}>{t('console.billing.colCreatedAt')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((r) => (
                        <tr key={r.id}>
                          <td className={`${td} max-w-[10rem] truncate font-mono text-zinc-300`} title={r.id}>
                            {r.id}
                          </td>
                          <td className={td}>
                            <span
                              className={`${orderStatusBadgeClassName(r.status)} md:text-sm`}
                              title={r.status}
                            >
                              {orderStatusLabel(r.status)}
                            </span>
                          </td>
                          <td className={`${td} text-zinc-400`} title={r.orderType}>
                            {orderTypeLabel(r.orderType)}
                          </td>
                          <td className={`${td} text-zinc-400`} title={r.paymentMethod}>
                            {paymentMethodLabel(r.paymentMethod)}
                          </td>
                          <td
                            className={`${td} max-w-[14rem] truncate font-mono text-xs text-zinc-300`}
                            title={r.transactionId}
                          >
                            {r.transactionId}
                          </td>
                          <td className={`${td} tabular-nums text-zinc-300`}>¥{r.amount}</td>
                          <td className={`${td} text-zinc-500`}>{r.createdAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <BillingPager
              page={ordersPage}
              total={ordersTotal}
              loading={ordersLoading}
              onPageChange={setOrdersPage}
            />
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <h3 className="shrink-0 text-sm font-semibold text-zinc-200">{t('console.billing.transactionsTitle')}</h3>
        <div className={panelShell}>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {txsInitialSpinner ? (
                <div className="scrollbar-surface flex min-h-0 flex-1 flex-col overflow-x-auto">
                  <table className="w-full min-w-[54rem] shrink-0 border-collapse text-left">
                    <thead>
                      <tr className="border-b border-white/[0.08] bg-surface-850/95 backdrop-blur-sm">
                        <th className={th}>{t('console.billing.colTxAccountType')}</th>
                        <th className={th}>{t('console.billing.colTxType')}</th>
                        <th className={th}>{t('console.billing.colTxDescription')}</th>
                        <th className={th}>{t('console.billing.colAmount')}</th>
                        <th className={th}>{t('console.billing.colBalanceBefore')}</th>
                        <th className={th}>{t('console.billing.colBalanceAfter')}</th>
                        <th className={th}>{t('console.billing.colCreatedAt')}</th>
                      </tr>
                    </thead>
                  </table>
                  <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 text-sm text-zinc-500">
                    {t('console.common.loading')}
                  </div>
                </div>
              ) : txsEmpty ? (
                <div className="scrollbar-surface flex min-h-0 flex-1 flex-col overflow-x-auto">
                  <table className="w-full min-w-[54rem] shrink-0 border-collapse text-left">
                    <thead>
                      <tr className="border-b border-white/[0.08] bg-surface-850/95 backdrop-blur-sm">
                        <th className={th}>{t('console.billing.colTxAccountType')}</th>
                        <th className={th}>{t('console.billing.colTxType')}</th>
                        <th className={th}>{t('console.billing.colTxDescription')}</th>
                        <th className={th}>{t('console.billing.colAmount')}</th>
                        <th className={th}>{t('console.billing.colBalanceBefore')}</th>
                        <th className={th}>{t('console.billing.colBalanceAfter')}</th>
                        <th className={th}>{t('console.billing.colCreatedAt')}</th>
                      </tr>
                    </thead>
                  </table>
                  <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 text-sm text-zinc-500">
                    {t('console.billing.emptyTx')}
                  </div>
                </div>
              ) : (
                <div
                  className={`scrollbar-surface min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-gutter:stable] ${txsLoading ? 'pointer-events-none opacity-50' : ''}`}
                >
                  <table className="w-full min-w-[54rem] border-collapse text-left">
                    <thead>
                      <tr className="sticky top-0 z-[1] border-b border-white/[0.08] bg-surface-850/95 backdrop-blur-sm">
                        <th className={th}>{t('console.billing.colTxAccountType')}</th>
                        <th className={th}>{t('console.billing.colTxType')}</th>
                        <th className={th}>{t('console.billing.colTxDescription')}</th>
                        <th className={th}>{t('console.billing.colAmount')}</th>
                        <th className={th}>{t('console.billing.colBalanceBefore')}</th>
                        <th className={th}>{t('console.billing.colBalanceAfter')}</th>
                        <th className={th}>{t('console.billing.colCreatedAt')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txs.map((r) => (
                        <tr key={r.rowKey}>
                          <td className={`${td} text-zinc-400`} title={r.accountType}>
                            {transactionAccountTypeLabel(r.accountType)}
                          </td>
                          <td className={td}>
                            <span
                              className={`${accountTransactionTypeBadgeClassName(r.type)} md:text-sm`}
                              title={r.type}
                            >
                              {transactionTypeLabel(r.type)}
                            </span>
                          </td>
                          <td
                            className={`${td} max-w-[18rem] truncate text-zinc-400`}
                            title={r.description !== '—' ? r.description : undefined}
                          >
                            {r.description}
                          </td>
                          <td className={`${td} tabular-nums`}>{txYuan(r.amount)}</td>
                          <td className={`${td} tabular-nums text-zinc-300`}>{txYuan(r.balanceBefore)}</td>
                          <td className={`${td} tabular-nums text-zinc-300`}>{txYuan(r.balanceAfter)}</td>
                          <td className={`${td} text-zinc-500`}>{r.createdAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <BillingPager page={txsPage} total={txsTotal} loading={txsLoading} onPageChange={setTxsPage} />
          </div>
        </div>
      </section>
    </div>
  )
}
