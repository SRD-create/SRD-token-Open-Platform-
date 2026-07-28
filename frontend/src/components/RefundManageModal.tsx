import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { notify } from '@/lib/toast'

type RefundManageModalProps = {
  open: boolean
  onClose: () => void
}

export function RefundManageModal({ open, onClose }: RefundManageModalProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const reasonHintId = useId()
  const reasonErrorId = useId()
  const [panelTab, setPanelTab] = useState<'apply' | 'history'>('apply')
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      setPanelTab('apply')
      setReason('')
      setReasonError(null)
    }
  }, [open])

  const tips = useMemo(() => {
    const raw = t('console.refund.tips', { returnObjects: true })
    return Array.isArray(raw) ? (raw as string[]) : []
  }, [t])

  if (!open) return null

  const feeHint = t('console.refund.feeHint')
  const reasonFilled = reason.trim().length > 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = reason.trim()
    if (!text) {
      setReasonError(t('console.refund.validationReason'))
      notify.warning(t('console.refund.toastReasonWarning'))
      return
    }
    setReasonError(null)
    notify.success(t('console.refund.toastSubmitSuccess'))
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[min(100dvh-1rem,640px)] w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.1] bg-surface-850 shadow-2xl shadow-black/50"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-[3.25rem] flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <span id={titleId} className="sr-only">
            {t('console.refund.title')}
          </span>
          <div className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-surface-900 p-1 ring-1 ring-white/[0.06]">
            <button
              type="button"
              onClick={() => setPanelTab('apply')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                panelTab === 'apply'
                  ? 'bg-zinc-700/90 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t('console.refund.applyTab')}
            </button>
            <button
              type="button"
              onClick={() => setPanelTab('history')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                panelTab === 'history'
                  ? 'bg-zinc-700/90 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t('console.refund.historyTab')}
            </button>
          </div>
          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
            aria-label={t('console.common.close')}
            onClick={onClose}
          >
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[min(calc(100dvh-8rem),560px)] overflow-y-auto overscroll-y-contain px-4 py-5 sm:px-5">
          {panelTab === 'apply' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <p className="text-sm font-medium text-zinc-300">{t('console.refund.hintTitle')}</p>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-500">
                  {tips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ol>
              </div>

              <div>
                <p className="text-sm font-medium text-zinc-300">{t('console.refund.currencyTitle')}</p>
                <p className="mt-2 text-sm text-zinc-400">{t('console.refund.currencyDesc')}</p>
              </div>

              <div>
                <p className="text-sm text-zinc-400">{t('console.refund.amountLine')}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-white">¥0.00</p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">{feeHint}</p>
              </div>

              <div>
                <label htmlFor="refund-reason" className="text-sm font-medium text-zinc-300">
                  {t('console.refund.reasonLabel')}
                  <span className="ml-0.5 text-red-400" aria-hidden>
                    *
                  </span>
                  <span className="ml-1.5 text-xs font-normal text-zinc-500">
                    {t('console.refund.requiredMark')}
                  </span>
                </label>
                <p id={reasonHintId} className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                  {t('console.refund.reasonHint')}
                </p>
                <textarea
                  id="refund-reason"
                  rows={4}
                  required
                  aria-required="true"
                  aria-invalid={reasonError ? 'true' : 'false'}
                  aria-describedby={
                    [reasonHintId, reasonError ? reasonErrorId : ''].filter(Boolean).join(' ') || undefined
                  }
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value)
                    if (reasonError) setReasonError(null)
                  }}
                  onBlur={() => {
                    if (!reason.trim()) setReasonError(t('console.refund.validationReason'))
                  }}
                  placeholder={t('console.refund.placeholder')}
                  className={[
                    'mt-2 w-full resize-y rounded-xl border bg-surface-950/90 px-3 py-2.5 text-base text-zinc-100 outline-none ring-accent/30 placeholder:text-zinc-600 focus:ring-2 md:text-sm',
                    reasonError
                      ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20'
                      : 'border-white/[0.1] focus:border-accent/35',
                  ].join(' ')}
                />
                {reasonError ? (
                  <p id={reasonErrorId} className="mt-1.5 text-xs text-red-400" role="alert">
                    {reasonError}
                  </p>
                ) : null}
              </div>

              <div className="flex w-full justify-center">
                <button
                  type="submit"
                  disabled={!reasonFilled}
                  className={[
                    'w-full max-w-md rounded-xl py-3 text-center text-sm font-semibold transition',
                    reasonFilled
                      ? 'bg-white text-black shadow-sm hover:bg-zinc-100'
                      : 'cursor-not-allowed bg-zinc-700 text-zinc-500',
                  ].join(' ')}
                >
                  {t('console.refund.submit')}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-surface-900/40 px-4 py-12 text-sm text-zinc-500">
              {t('console.refund.emptyHistory')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
