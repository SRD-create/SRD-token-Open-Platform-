import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleXmark, faXmark } from '@fortawesome/free-solid-svg-icons'
import { faAlipay, faWeixin } from '@fortawesome/free-brands-svg-icons'
import QRCode from 'qrcode'
import { playPartnerJoinConfetti } from '@/lib/partnerJoinConfetti'
import { notify } from '@/lib/toast'
import { getOrder } from '@/api/nexus/orders'
import { safeRecord, safeString } from '@/lib/safe'

type PayMethod = 'wechat' | 'alipay'

type Step = 'qr' | 'success' | 'failed'

type RechargePayModalProps = {
  open: boolean
  onClose: () => void
  method: PayMethod
  /** 已格式化的金额展示，如 100.00 */
  amountDisplay: string
  /** 后端 Native 支付返回的二维码图片 URL（优先于 env 静态图） */
  remoteQrUrl?: string | null
  /** 用于轮询 `GET /orders/{order_id}` 直至支付完成 */
  payOrderId?: number | null
  /** 检测到已支付后、进入成功页面前执行（可选） */
  onConfirmPaid?: () => Promise<void> | void
  /** 覆盖扫码页主标题（如代理加盟） */
  copyTitle?: string
  /** 覆盖「应付金额」整句（已含 ¥ 等时直接传入） */
  copyAmountLine?: string
  copyScanWechat?: string
  copyScanAlipay?: string
  copyDemoCaption?: string
  copyPlaceholderHint?: string
  copySuccessTitle?: string
  copySuccessHint?: string
  copyDone?: string
  /** 成功页点击「完成」时先于 `onClose` 调用（如跳转控制台） */
  onPaidDone?: () => void
  copyFailTitle?: string
  copyFailHint?: string
  copyFailDone?: string
}

function normalizeStatusToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_')
}

function orderPaymentSignals(raw: unknown): { status: string; paidAt: string } {
  const r = safeRecord(raw)
  const status = safeString(r.status ?? r.order_status ?? r.state ?? r.payment_status ?? '')
  const paidAt = safeString(r.paid_at ?? r.paidAt ?? r.pay_time ?? r.payment_time ?? '')
  const tradeState = safeString(r.trade_state ?? '')
  return { status: status || tradeState, paidAt }
}

function isPaidStatus(status: string): boolean {
  const s = normalizeStatusToken(status)
  if (!s) return false
  if (/(^|_)(unpaid|not_paid|notpaid|nopay)(_|$)/.test(s)) return false
  if (/(^|_)(pending|processing|created|waiting|wait_pay|waitpay)(_|$)/.test(s)) return false
  return (
    s === 'paid' ||
    s === 'success' ||
    s === 'successful' ||
    s === 'completed' ||
    s === 'complete' ||
    s === 'paid_success' ||
    s === 'payment_success' ||
    s === '已支付' ||
    s === '支付成功'
  )
}

function isFailedStatus(status: string): boolean {
  const s = normalizeStatusToken(status)
  if (!s) return false
  return (
    s.includes('fail') ||
    s.includes('cancel') ||
    s.includes('closed') ||
    s.includes('reject') ||
    s.includes('error') ||
    s.includes('invalid')
  )
}

type OrderPayInterpret = 'paid' | 'failed' | 'pending'

function interpretOrderPayment(detail: unknown): OrderPayInterpret {
  const { status, paidAt } = orderPaymentSignals(detail)
  if (isPaidStatus(status)) return 'paid'
  if (paidAt && !isFailedStatus(status)) return 'paid'
  if (status && isFailedStatus(status)) return 'failed'
  return 'pending'
}

function FakeQrGrid({ seedKey }: { seedKey: string }) {
  const cells = useMemo(() => {
    let h = 0
    for (let i = 0; i < seedKey.length; i++) {
      h = (h * 31 + seedKey.charCodeAt(i)) | 0
    }
    return Array.from({ length: 225 }, (_, i) => {
      const v = (h + i * 17) % 13
      return v < 5
    })
  }, [seedKey])

  return (
    <div className="w-full rounded-xl border border-white/[0.12] bg-white p-3 shadow-inner">
      <div className="grid aspect-square w-full grid-cols-[repeat(15,1fr)] gap-px bg-zinc-200">
        {cells.map((dark, i) => (
          <div key={i} className={dark ? 'bg-zinc-900' : 'bg-white'} />
        ))}
      </div>
    </div>
  )
}

/**
 * 必须在「支付成功」面板挂载后再触发：`AnimatePresence mode="wait"` 会推迟成功子树挂载。
 * `fireKey` 仅在进入成功态时递增；父级 `playedKeyRef` 防止 React Strict Mode 二次挂载再播一遍（子树 remount 时内部 ref 会丢）。
 */
function PaySuccessConfettiLayer({
  canvasRef,
  fireKey,
  playedKeyRef,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  fireKey: number
  playedKeyRef: MutableRefObject<number | null>
}) {
  useLayoutEffect(() => {
    if (fireKey === 0) return
    if (playedKeyRef.current === fireKey) return
    playedKeyRef.current = fireKey

    let cancelConfetti = () => {}
    let innerRaf = 0
    const outerRaf = window.requestAnimationFrame(() => {
      innerRaf = window.requestAnimationFrame(() => {
        innerRaf = 0
        const el = canvasRef.current
        if (!el) return
        cancelConfetti = playPartnerJoinConfetti(el, {
          useWorker: false,
          singleBurst: true,
          flushToCanvasCorners: true,
          disableForReducedMotion: false,
        })
      })
    })

    return () => {
      window.cancelAnimationFrame(outerRaf)
      if (innerRaf !== 0) window.cancelAnimationFrame(innerRaf)
      cancelConfetti()
    }
  }, [canvasRef, fireKey, playedKeyRef])

  return null
}

export function RechargePayModal({
  open,
  onClose,
  method,
  amountDisplay,
  remoteQrUrl,
  payOrderId,
  onConfirmPaid,
  copyTitle,
  copyAmountLine,
  copyScanWechat,
  copyScanAlipay,
  copyDemoCaption,
  copyPlaceholderHint,
  copySuccessTitle,
  copySuccessHint,
  copyDone,
  onPaidDone,
  copyFailTitle,
  copyFailHint,
  copyFailDone,
}: RechargePayModalProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const [step, setStep] = useState<Step>('qr')
  /** 每次进入支付成功态 +1，用于礼花只播一次（含防 Strict Mode 双挂载） */
  const [successConfettiKey, setSuccessConfettiKey] = useState(0)
  const prevStepForConfettiRef = useRef<Step>('qr')
  const successConfettiPlayedKeyRef = useRef<number | null>(null)
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)
  const [qrCanvasReady, setQrCanvasReady] = useState(false)
  const onConfirmPaidRef = useRef(onConfirmPaid)
  onConfirmPaidRef.current = onConfirmPaid

  const wechatQr =
    (import.meta.env.VITE_RECHARGE_WECHAT_QR_URL as string | undefined)?.trim() || ''
  const alipayQr = (import.meta.env.VITE_RECHARGE_ALIPAY_QR_URL as string | undefined)?.trim() || ''
  const remote = remoteQrUrl?.trim() || ''
  const qrSrc = remote || (method === 'alipay' ? alipayQr : wechatQr)
  const qrImageSrc = /^(https?:\/\/|data:image\/)/i.test(qrSrc) ? qrSrc : ''
  const qrText = qrImageSrc ? '' : qrSrc

  const orderIdOk =
    payOrderId != null && Number.isFinite(payOrderId) && payOrderId > 0

  useEffect(() => {
    if (!open) {
      setStep('qr')
      setQrCanvasReady(false)
      prevStepForConfettiRef.current = 'qr'
    }
  }, [open])

  useEffect(() => {
    if (step === 'success' && prevStepForConfettiRef.current !== 'success') {
      setSuccessConfettiKey((k) => k + 1)
    }
    prevStepForConfettiRef.current = step
  }, [step])

  useEffect(() => {
    if (!open || step !== 'qr') return
    if (!qrText) {
      setQrCanvasReady(false)
      return
    }
    const canvas = qrCanvasRef.current
    if (!canvas) return
    setQrCanvasReady(false)
    void QRCode.toCanvas(canvas, qrText, {
      width: 240,
      margin: 2,
      color: {
        dark: '#111827',
        light: '#FFFFFF',
      },
    })
      .then(() => setQrCanvasReady(true))
      .catch(() => setQrCanvasReady(false))
  }, [open, qrText, step])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open || step !== 'qr' || !orderIdOk) return

    const orderId = payOrderId as number
    let cancelled = false
    let timeoutId = 0

    const clearPollTimer = () => {
      if (timeoutId !== 0) {
        window.clearTimeout(timeoutId)
        timeoutId = 0
      }
    }

    const schedule = (ms: number) => {
      clearPollTimer()
      timeoutId = window.setTimeout(() => {
        void pollOnce()
      }, ms)
    }

    const pollOnce = async () => {
      if (cancelled) return
      try {
        const detail = await getOrder(orderId)
        if (cancelled) return
        const verdict = interpretOrderPayment(detail)
        if (verdict === 'paid') {
          clearPollTimer()
          try {
            await onConfirmPaidRef.current?.()
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            notify.error(msg)
          }
          if (cancelled) return
          clearPollTimer()
          setStep('success')
          return
        }
        if (verdict === 'failed') {
          clearPollTimer()
          if (!cancelled) setStep('failed')
          return
        }
      } catch {
        /* 网络抖动：继续下一轮 */
      }
      if (!cancelled) schedule(2800)
    }

    schedule(600)
    return () => {
      cancelled = true
      clearPollTimer()
    }
  }, [open, step, orderIdOk, payOrderId])

  const transitionEase = [0.22, 1, 0.36, 1] as const

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:p-4"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative max-h-[min(100dvh-1rem,720px)] w-full max-w-md overflow-y-auto overscroll-y-contain rounded-2xl border border-white/[0.08] bg-surface-850/95 p-6 shadow-panel backdrop-blur-xl sm:max-w-lg sm:p-8"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-20 rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
              aria-label={t('console.common.close')}
            >
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
            </button>

            <AnimatePresence mode="wait">
              {step === 'qr' ? (
                <motion.div
                  key="pay-step-qr"
                  className="relative z-10"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
                  transition={{ duration: 0.3, ease: transitionEase }}
                >
                  <div className="mb-4 flex items-center gap-2">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl text-white shadow-md ${
                        method === 'wechat' ? 'bg-[#07C160]' : 'bg-[#1677FF]'
                      }`}
                      aria-hidden
                    >
                      <FontAwesomeIcon icon={method === 'wechat' ? faWeixin : faAlipay} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 id={titleId} className="text-lg font-semibold text-white sm:text-xl">
                        {copyTitle ?? t('console.recharge.payModal.title')}
                      </h2>
                      <p className="text-sm font-medium tabular-nums text-accent-glow">
                        {copyAmountLine ?? t('console.recharge.payModal.amountLine', { amount: amountDisplay })}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400">
                    {method === 'wechat'
                      ? copyScanWechat ?? t('console.recharge.payModal.scanWechat')
                      : copyScanAlipay ?? t('console.recharge.payModal.scanAlipay')}
                  </p>
                  <div className="mx-auto mt-6 w-full max-w-[220px] sm:max-w-[240px]">
                    {qrImageSrc ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.35, ease: transitionEase, delay: 0.05 }}
                        className="overflow-hidden rounded-xl border border-white/[0.1] bg-white p-1.5 shadow-panel sm:p-2"
                      >
                        <img src={qrImageSrc} alt="" className="block h-auto w-full max-w-full" />
                      </motion.div>
                    ) : qrText ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.35, ease: transitionEase, delay: 0.05 }}
                        className="relative overflow-hidden rounded-xl border border-white/[0.1] bg-white p-1.5 shadow-panel sm:p-2"
                      >
                        <canvas ref={qrCanvasRef} className="block h-auto w-full max-w-full" />
                        {!qrCanvasReady ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-surface-900/80 p-6 text-center text-xs text-zinc-400">
                            {t('console.recharge.payModal.qrGenerating')}
                          </div>
                        ) : null}
                      </motion.div>
                    ) : (
                      <div className="space-y-2">
                        <FakeQrGrid seedKey={`${method}-${amountDisplay}`} />
                        <p className="text-center text-xs leading-relaxed text-zinc-500">
                          {copyDemoCaption ?? t('console.recharge.payModal.demoQrCaption')}
                        </p>
                        <p className="text-center text-[11px] leading-relaxed text-zinc-600">
                          {copyPlaceholderHint ?? t('console.recharge.payModal.placeholderHint')}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-8 space-y-3">
                    {orderIdOk ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.15, duration: 0.35 }}
                        className="mx-auto flex w-full max-w-sm justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5"
                      >
                        <div className="inline-flex max-w-full items-center gap-2">
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/35 [animation-duration:1.8s]" />
                            <span className="relative block h-2 w-2 rounded-full bg-sky-400" />
                          </span>
                          <p className="min-w-0 max-w-[16.5rem] text-left text-xs leading-relaxed text-zinc-400 sm:max-w-xs">
                            {t('console.recharge.payModal.pollingHint')}
                          </p>
                        </div>
                      </motion.div>
                    ) : (
                      <p className="text-center text-xs leading-relaxed text-amber-200/85">
                        {t('console.recharge.payModal.cannotAutoVerify')}
                      </p>
                    )}
                  </div>
                </motion.div>
              ) : step === 'success' ? (
                <motion.div
                  key="pay-step-success"
                  className="relative z-10 min-h-0 -mx-6 w-[calc(100%+3rem)] max-w-none sm:-mx-8 sm:w-[calc(100%+4rem)]"
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.38, ease: transitionEase }}
                >
                  <canvas
                    ref={confettiCanvasRef}
                    className="pointer-events-none absolute inset-0 z-20 h-full w-full rounded-2xl"
                    aria-hidden
                  />
                  <PaySuccessConfettiLayer
                    canvasRef={confettiCanvasRef}
                    fireKey={successConfettiKey}
                    playedKeyRef={successConfettiPlayedKeyRef}
                  />
                  <div className="relative z-10 flex flex-col items-center px-6 py-3 text-center sm:px-8 sm:py-4">
                    <motion.div
                      initial={{ scale: 0.82, opacity: 0, rotate: -8 }}
                      animate={{ scale: 1, opacity: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 340, damping: 20, mass: 0.85 }}
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-violet-600 text-2xl text-white shadow-[0_12px_40px_-10px_rgba(99,102,241,0.55)]"
                      aria-hidden
                    >
                      ✓
                    </motion.div>
                    <motion.h2
                      id={titleId}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.06, duration: 0.32, ease: transitionEase }}
                      className="mt-4 text-xl font-bold text-white sm:text-2xl"
                    >
                      {copySuccessTitle ?? t('console.recharge.payModal.successTitle')}
                    </motion.h2>
                    <motion.p
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12, duration: 0.32, ease: transitionEase }}
                      className="mt-2 max-w-sm text-sm text-zinc-400"
                    >
                      {copySuccessHint ?? t('console.recharge.payModal.successHint')}
                    </motion.p>
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.3, ease: transitionEase }}
                      onClick={() => {
                        onPaidDone?.()
                        onClose()
                      }}
                      className="mt-5 w-full max-w-xs rounded-full border border-white/[0.12] bg-white/[0.06] py-3 text-sm font-semibold text-white transition hover:border-sky-400/40 hover:bg-sky-500/15 hover:text-sky-100"
                    >
                      {copyDone ?? t('console.recharge.payModal.done')}
                    </motion.button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="pay-step-failed"
                  className="relative z-10 min-h-0"
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.38, ease: transitionEase }}
                >
                  <div className="relative z-10 flex flex-col items-center py-3 text-center sm:py-4">
                    <motion.div
                      initial={{ scale: 0.82, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 340, damping: 22, mass: 0.85 }}
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-rose-600 to-red-800 text-2xl text-white shadow-[0_12px_40px_-10px_rgba(244,63,94,0.45)]"
                      aria-hidden
                    >
                      <FontAwesomeIcon icon={faCircleXmark} className="h-8 w-8" />
                    </motion.div>
                    <motion.h2
                      id={titleId}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.06, duration: 0.32, ease: transitionEase }}
                      className="mt-4 text-xl font-bold text-white sm:text-2xl"
                    >
                      {copyFailTitle ?? t('console.recharge.payModal.failTitle')}
                    </motion.h2>
                    <motion.p
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12, duration: 0.32, ease: transitionEase }}
                      className="mt-2 max-w-sm text-sm text-zinc-400"
                    >
                      {copyFailHint ?? t('console.recharge.payModal.failHint')}
                    </motion.p>
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.3, ease: transitionEase }}
                      onClick={() => {
                        onClose()
                      }}
                      className="mt-5 w-full max-w-xs rounded-full border border-white/[0.12] bg-white/[0.06] py-3 text-sm font-semibold text-white transition hover:border-rose-400/35 hover:bg-rose-500/10 hover:text-rose-100"
                    >
                      {copyFailDone ?? t('console.recharge.payModal.failDone')}
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
