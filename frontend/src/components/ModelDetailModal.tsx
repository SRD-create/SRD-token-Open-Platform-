import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { VendorMark } from '@/components/VendorMark'
import type { ModelItem, ModelPriceTier, PricingGranularity } from '@/modelSquare/modelItem'
import {
  PRICING_TOKEN_MULT,
  formatPriceTierContextLabel,
  formatYuanForTokenBatch,
} from '@/modelSquare/modelItem'

function formatCacheStorageCell(tier: ModelPriceTier, tokenMult: number, t: (k: string) => string): string {
  if (tier.cacheStorageNote) return tier.cacheStorageNote
  if (tier.cacheStoragePrice === 0) return t('models.detailPriceLimitedFree')
  if (tier.cacheStoragePrice != null)
    return formatYuanForTokenBatch(tier.cacheStoragePrice, tokenMult)
  return t('models.detailPriceDash')
}

function formatCacheHitCell(tier: ModelPriceTier, tokenMult: number, t: (k: string) => string): string {
  if (tier.cacheHitPrice == null) return t('models.detailPriceDash')
  return formatYuanForTokenBatch(tier.cacheHitPrice, tokenMult)
}

export function ModelDetailModal({ model, onClose }: { model: ModelItem | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [pricingGranularity, setPricingGranularity] = useState<PricingGranularity>('perToken')

  useEffect(() => {
    if (!model) return
    setPricingGranularity('perToken')
  }, [model?.id])

  useEffect(() => {
    if (!model) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [model, onClose])

  const tokenMult = PRICING_TOKEN_MULT[pricingGranularity]
  const inputRefPrice = formatYuanForTokenBatch(model?.inputTokenPrice ?? null, tokenMult)
  const outputRefPrice = formatYuanForTokenBatch(model?.outputTokenPrice ?? null, tokenMult)
  const hasPriceTiers = !!model && model.priceTiers.length > 0

  return (
    <AnimatePresence>
      {model ? (
        <motion.div
          key={model.id}
          className="fixed inset-0 z-[105] flex items-center justify-center bg-black/75 px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:p-4"
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
            aria-labelledby="model-detail-title"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className={`relative max-h-[min(92dvh,44rem)] w-full overflow-y-auto overscroll-y-contain rounded-2xl border border-cyan-500/20 bg-zinc-950/95 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_32px_80px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl sm:p-6 ${
              hasPriceTiers ? 'max-w-lg sm:max-w-3xl' : 'max-w-lg sm:max-w-xl'
            }`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent"
              aria-hidden
            />
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-10 rounded-lg border border-white/[0.08] bg-black/40 p-2 text-zinc-400 transition hover:border-cyan-500/25 hover:text-cyan-100 sm:right-4 sm:top-4"
              aria-label={t('models.detailModalClose')}
            >
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
            </button>

            <div className="pr-10">
              <div className="flex items-start gap-3">
                <VendorMark id={model.vendorId} size="md" />
                <div className="min-w-0 flex-1">
                  <h2
                    id="model-detail-title"
                    className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-lg font-semibold tracking-tight text-transparent"
                  >
                    {model.name}
                  </h2>
                </div>
              </div>

              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-white/[0.06] pb-3">
                  <dt className="text-zinc-500">{t('models.detailModalType')}</dt>
                  <dd className="font-medium text-zinc-200">{model.typeLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-cyan-500/80">
                    {t('models.detailModalDesc')}
                  </dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-zinc-400">{model.desc}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-cyan-500/80">
                    {t('models.detailModalPricing')}
                  </dt>
                  <dd className="mt-2 rounded-xl border border-white/[0.06] bg-black/35 p-3">
                    <div
                      className="flex rounded-lg border border-white/[0.08] bg-black/40 p-0.5 text-[11px] font-medium"
                      role="group"
                      aria-label={t('models.pricingGranularity')}
                    >
                      {(
                        [
                          ['perToken', 'models.pricingPerToken'],
                          ['per1k', 'models.pricingPer1k'],
                          ['per1m', 'models.pricingPer1m'],
                        ] as const
                      ).map(([id, labelKey]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setPricingGranularity(id)}
                          className={`min-w-0 flex-1 rounded-md px-1.5 py-2 leading-tight text-zinc-400 transition sm:px-2 ${
                            pricingGranularity === id
                              ? 'bg-white/[0.1] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                              : 'hover:text-zinc-200'
                          }`}
                        >
                          {t(labelKey)}
                        </button>
                      ))}
                    </div>
                    {hasPriceTiers ? (
                      <div className="mt-3 overflow-x-auto rounded-lg border border-white/[0.06]">
                        <table className="w-full min-w-[32rem] border-collapse text-left text-[11px]">
                          <thead>
                            <tr className="border-b border-white/[0.06] bg-black/30 text-zinc-500">
                              <th className="whitespace-nowrap px-2 py-2 font-medium sm:px-2.5">
                                {t('models.detailPriceColContext')}
                              </th>
                              <th className="whitespace-nowrap px-2 py-2 font-medium sm:px-2.5">
                                {t('models.detailPriceColInput')}
                              </th>
                              <th className="whitespace-nowrap px-2 py-2 font-medium sm:px-2.5">
                                {t('models.detailPriceColOutput')}
                              </th>
                              <th className="whitespace-nowrap px-2 py-2 font-medium sm:px-2.5">
                                {t('models.detailPriceColCacheStore')}
                              </th>
                              <th className="whitespace-nowrap px-2 py-2 font-medium sm:px-2.5">
                                {t('models.detailPriceColCacheHit')}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {model!.priceTiers.map((tier, idx) => (
                              <tr
                                key={`${model!.id}-tier-${tier.contextRangeMin}-${tier.contextRangeMax}-${idx}`}
                                className="border-b border-white/[0.04] last:border-0 odd:bg-white/[0.02]"
                              >
                                <td className="max-w-[11rem] px-2 py-2 align-top text-zinc-300 sm:px-2.5">
                                  {formatPriceTierContextLabel(
                                    tier.contextRangeMin,
                                    tier.contextRangeMax,
                                    t,
                                  )}
                                </td>
                                <td className="whitespace-nowrap px-2 py-2 font-mono tabular-nums text-cyan-200/90 sm:px-2.5">
                                  {formatYuanForTokenBatch(tier.inputTokenPrice, tokenMult)}
                                </td>
                                <td className="whitespace-nowrap px-2 py-2 font-mono tabular-nums text-violet-200/85 sm:px-2.5">
                                  {formatYuanForTokenBatch(tier.outputTokenPrice, tokenMult)}
                                </td>
                                <td className="whitespace-nowrap px-2 py-2 font-mono text-zinc-300 sm:px-2.5">
                                  {formatCacheStorageCell(tier, tokenMult, t)}
                                </td>
                                <td className="whitespace-nowrap px-2 py-2 font-mono tabular-nums text-zinc-300 sm:px-2.5">
                                  {formatCacheHitCell(tier, tokenMult, t)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2.5 font-mono text-xs">
                        <div>
                          <p className="text-[11px] text-zinc-500">{t('models.detailInputUnitPrice')}</p>
                          <p className="mt-0.5 tabular-nums text-sm text-cyan-200/90">{inputRefPrice}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-zinc-500">{t('models.detailOutputUnitPrice')}</p>
                          <p className="mt-0.5 tabular-nums text-sm text-violet-200/85">{outputRefPrice}</p>
                        </div>
                      </div>
                    )}
                  </dd>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {model.tags.map((tag, i) => (
                    <span
                      key={`${model.id}-d-${i}-${tag}`}
                      className="rounded-md border border-cyan-500/15 bg-cyan-500/[0.06] px-2 py-0.5 text-[10px] font-medium text-cyan-100/75"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      model.healthy
                        ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]'
                        : 'bg-amber-400'
                    }`}
                    aria-hidden
                  />
                  <span
                    className={
                      model.healthy
                        ? 'text-sm font-medium text-emerald-300/90'
                        : 'text-sm font-medium text-amber-300/90'
                    }
                  >
                    {model.healthy ? t('models.healthy') : t('models.maintenance')}
                  </span>
                </div>
              </dl>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
