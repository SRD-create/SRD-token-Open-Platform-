import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { faWeixin } from '@fortawesome/free-brands-svg-icons'
import { registerAgent } from '@/api/nexus/account'
import { pickNativePayQrUrl, pickPaymentFlowOrderId } from '@/api/mappers/console'
import { NexusBizError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { notify } from '@/lib/toast'
import { RechargePayModal } from '@/components/RechargePayModal'

type PartnerJoinModalProps = {
  open: boolean
  onClose: () => void
  /** 当前选中的加盟档位金额（元），仅展示 */
  joinFeeYuan: number
  /** 所选卡片在 `GET /agents/levels` 中的 `id`，作为 `agent_level_id` 提交 */
  agentLevelId: number
  /** 当前接口返回的合法档位 id，用于校验 */
  allowedAgentLevelIds: readonly number[]
}

export function PartnerJoinModal({
  open,
  onClose: onDismissJoinFlow,
  joinFeeYuan,
  agentLevelId,
  allowedAgentLevelIds,
}: PartnerJoinModalProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token, refreshMe } = useAuth()
  const [payOpen, setPayOpen] = useState(false)
  const [remoteQrUrl, setRemoteQrUrl] = useState<string | null>(null)
  const [payOrderId, setPayOrderId] = useState<number | null>(null)
  const [startPayBusy, setStartPayBusy] = useState(false)

  const amountDisplay = joinFeeYuan.toFixed(2)
  const feeOk = agentLevelId > 0 && allowedAgentLevelIds.includes(agentLevelId)

  useEffect(() => {
    if (!open) {
      setPayOpen(false)
      setRemoteQrUrl(null)
      setPayOrderId(null)
      setStartPayBusy(false)
    }
  }, [open])

  useEffect(() => {
    if (!open || payOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismissJoinFlow()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onDismissJoinFlow, payOpen])

  const startWechatPay = () => {
    void (async () => {
      if (!token || !feeOk || startPayBusy) return
      setStartPayBusy(true)
      setRemoteQrUrl(null)
      setPayOrderId(null)
      try {
        const raw = await registerAgent({
          agent_level_id: agentLevelId,
          payment_method: 'wechat',
        })
        setRemoteQrUrl(pickNativePayQrUrl(raw))
        setPayOrderId(pickPaymentFlowOrderId(raw))
        setPayOpen(true)
      } catch (e) {
        const msg =
          e instanceof NexusBizError
            ? e.message
            : e instanceof Error
              ? e.message
              : t('partners.joinModal.payStartFail')
        notify.error(msg)
      } finally {
        setStartPayBusy(false)
      }
    })()
  }

  const showPickShell = open && !payOpen

  return (
    <>
      <AnimatePresence>
        {showPickShell ? (
          <motion.div
            className="fixed inset-0 z-[105] flex items-center justify-center bg-black/70 px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:p-4"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) onDismissJoinFlow()
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="partner-join-title"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="relative max-h-[min(100dvh-1rem,720px)] w-full max-w-md overflow-y-auto overscroll-y-contain rounded-2xl border border-white/[0.08] bg-surface-850/95 p-6 shadow-panel backdrop-blur-xl sm:max-w-lg sm:p-8"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={onDismissJoinFlow}
                className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
                aria-label={t('partners.joinModal.close')}
              >
                <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
              </button>

              <div className="relative z-10">
                <h2
                  id="partner-join-title"
                  className="pr-10 text-lg font-semibold text-white sm:text-xl"
                >
                  {t('partners.joinModal.title')}
                </h2>
                <p className="mt-2 text-sm text-zinc-400">{t('partners.joinModal.subtitle')}</p>
                <p className="mt-3 text-sm font-medium tabular-nums text-accent-glow">
                  {t('console.recharge.payModal.amountLine', { amount: amountDisplay })}
                </p>
                {!feeOk ? (
                  <p className="mt-3 text-sm text-amber-400/90">{t('partners.joinModal.invalidTier')}</p>
                ) : null}
                <div className="mt-8 grid gap-3 sm:gap-4">
                  <button
                    type="button"
                    disabled={!feeOk || !token || startPayBusy}
                    onClick={startWechatPay}
                    className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-6 text-center transition hover:border-emerald-400/50 hover:bg-emerald-500/[0.14] disabled:pointer-events-none disabled:opacity-50"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#07C160] text-2xl text-white shadow-lg shadow-emerald-900/40">
                      <FontAwesomeIcon icon={faWeixin} className="h-8 w-8" aria-hidden />
                    </span>
                    <span className="text-sm font-semibold text-emerald-200">
                      {startPayBusy ? t('console.common.loading') : t('partners.joinModal.wechat')}
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <RechargePayModal
        open={payOpen}
        onClose={() => {
          setPayOpen(false)
          setRemoteQrUrl(null)
          setPayOrderId(null)
          onDismissJoinFlow()
        }}
        onConfirmPaid={async () => {
          await refreshMe()
        }}
        method="wechat"
        amountDisplay={amountDisplay}
        remoteQrUrl={remoteQrUrl}
        payOrderId={payOrderId}
        copyTitle={t('partners.joinPayModal.title')}
        copyAmountLine={t('console.recharge.payModal.amountLine', { amount: amountDisplay })}
        copyScanWechat={t('partners.joinModal.scanWechat')}
        copyDemoCaption={t('console.recharge.payModal.demoQrCaption')}
        copyPlaceholderHint={t('console.recharge.payModal.placeholderHint')}
        copySuccessTitle={t('partners.joinModal.successTitle')}
        copySuccessHint={t('partners.joinModal.successHint')}
        copyFailTitle={t('partners.joinModal.failTitle')}
        copyFailHint={t('partners.joinModal.failHint')}
        copyFailDone={t('partners.joinModal.failDone')}
        copyDone={t('partners.joinModal.goConsole')}
        onPaidDone={() => {
          void (async () => {
            await refreshMe()
            onDismissJoinFlow()
            navigate('/console/usage')
          })()
        }}
      />
    </>
  )
}
