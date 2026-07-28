import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import { VendorMark } from '@/components/VendorMark'
import { copyTextToClipboard } from '@/lib/copyToClipboard'
import { notify } from '@/lib/toast'
import { stripDuplicateNameLineFromDesc, type ModelItem } from '@/modelSquare/modelItem'

const TIP_W = 352
const TIP_OFFSET = 10
const LEAVE_MS = 180

type TipPos = { left: number; top: number; maxH: number }

function computeTipStyle(clientX: number, clientY: number, cardH: number): TipPos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pad = 8
  let left = clientX + TIP_OFFSET
  let top = clientY + TIP_OFFSET
  if (left + TIP_W > vw - pad) {
    left = clientX - TIP_W - TIP_OFFSET
  }
  if (left < pad) left = pad
  if (left + TIP_W > vw - pad) left = Math.max(pad, vw - TIP_W - pad)

  let maxH = Math.min(cardH, vh - top - pad)
  if (maxH < 64) {
    const spaceAbove = clientY - pad
    if (spaceAbove > 80) {
      const tryTop = clientY - Math.min(cardH, spaceAbove) - TIP_OFFSET
      if (tryTop >= pad) {
        top = tryTop
        maxH = Math.min(cardH, vh - top - pad)
      }
    }
  }
  maxH = Math.max(64, Math.min(maxH, cardH, vh - top - pad))
  if (top + maxH > vh - pad) {
    top = Math.max(pad, vh - pad - maxH)
  }
  maxH = Math.min(maxH, cardH, vh - top - pad)
  return { left, top, maxH: Math.max(64, maxH) }
}

export function ModelSquareMarketCard({
  model,
  onOpenDetail,
}: {
  model: ModelItem
  onOpenDetail: (m: ModelItem) => void
}) {
  const { t } = useTranslation()
  const descForCard = stripDuplicateNameLineFromDesc(model.name, model.desc)
  const articleRef = useRef<HTMLElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const [tipOpen, setTipOpen] = useState(false)
  const [tipPos, setTipPos] = useState<TipPos>({ left: 0, top: 0, maxH: 240 })

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
  }, [])

  const updateTipFromEvent = useCallback((clientX: number, clientY: number) => {
    lastPointerRef.current = { x: clientX, y: clientY }
    const el = articleRef.current
    if (!el) return
    const cardH = el.getBoundingClientRect().height
    setTipPos(computeTipStyle(clientX, clientY, cardH))
  }, [])

  const onDescPointerEnter = useCallback(
    (e: React.PointerEvent) => {
      clearLeaveTimer()
      updateTipFromEvent(e.clientX, e.clientY)
      setTipOpen(true)
    },
    [clearLeaveTimer, updateTipFromEvent],
  )

  const onDescPointerMove = useCallback(
    (e: React.PointerEvent) => {
      setTipOpen(true)
      updateTipFromEvent(e.clientX, e.clientY)
    },
    [updateTipFromEvent],
  )

  const onDescPointerLeave = useCallback(() => {
    clearLeaveTimer()
    leaveTimerRef.current = setTimeout(() => {
      setTipOpen(false)
      leaveTimerRef.current = null
    }, LEAVE_MS)
  }, [clearLeaveTimer])

  const onTipPointerEnter = useCallback(() => {
    clearLeaveTimer()
  }, [clearLeaveTimer])

  const onTipPointerLeave = useCallback(() => {
    setTipOpen(false)
  }, [])

  useEffect(() => {
    if (!tipOpen) return
    const onResize = () => {
      const p = lastPointerRef.current
      const ar = articleRef.current
      if (!ar) return
      const h = ar.getBoundingClientRect().height
      setTipPos(computeTipStyle(p.x, p.y, h))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [tipOpen])

  useEffect(
    () => () => {
      clearLeaveTimer()
    },
    [clearLeaveTimer],
  )

  return (
    <article
      ref={articleRef}
      className="group relative z-0 flex flex-col overflow-visible rounded-2xl border border-white/[0.07] bg-gradient-to-b from-zinc-900/95 to-black/90 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_50px_-28px_rgba(0,0,0,0.9)] transition duration-300 active:scale-[0.995] hover:z-20 hover:border-cyan-400/25 hover:shadow-[0_0_40px_-16px_rgba(34,211,238,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-4 md:p-5"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px scale-x-90 bg-gradient-to-r from-transparent via-cyan-400/45 to-transparent opacity-0 transition duration-300 group-hover:scale-x-100 group-hover:opacity-100"
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => onOpenDetail(model)}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg outline-none ring-offset-2 ring-offset-zinc-900 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-cyan-400/50 sm:min-h-0 sm:min-w-0"
            aria-label={t('models.detailOpenAria')}
          >
            <VendorMark id={model.vendorId} size="md" />
          </button>
          <h2 className="min-w-0 flex-1 text-sm font-semibold tracking-tight">
            <button
              type="button"
              title={t('models.copyNameHint')}
              aria-label={`${t('models.copyNameAria')}: ${model.name}`}
              className="block w-full min-w-0 max-w-full cursor-pointer truncate rounded-md border-0 bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text p-0 text-left text-transparent outline-none ring-1 ring-transparent transition-all duration-200 ease-out hover:from-cyan-50 hover:via-white hover:to-cyan-100 hover:shadow-[0_0_28px_-6px_rgba(34,211,238,0.35)] hover:ring-cyan-400/35 focus-visible:ring-2 focus-visible:ring-cyan-400/45"
              onClick={async () => {
                const ok = await copyTextToClipboard(model.name)
                if (ok) notify.success(t('models.copyNameSuccess'))
                else notify.error(t('models.copyNameFail'))
              }}
            >
              <span className="block truncate">{model.name}</span>
            </button>
          </h2>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-transparent p-1.5 text-cyan-500/50 transition hover:border-cyan-500/20 hover:bg-cyan-500/10 hover:text-cyan-200 sm:min-h-0 sm:min-w-0 sm:p-1.5"
          aria-label={t('models.modelInfoAria')}
          onClick={() => onOpenDetail(model)}
        >
          <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
        </button>
      </div>
      <div
        className="relative z-[8] mt-3 min-h-0 flex-1"
        onPointerEnter={onDescPointerEnter}
        onPointerMove={onDescPointerMove}
        onPointerLeave={onDescPointerLeave}
      >
        <p className="line-clamp-3 cursor-default text-xs leading-relaxed text-zinc-500">
          {descForCard}
        </p>
      </div>
      {tipOpen
        ? createPortal(
            <div
              ref={tipRef}
              role="tooltip"
              className="fixed z-[200] w-[min(22rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] flex flex-col overflow-hidden rounded-lg border border-cyan-500/25 bg-zinc-950/98 text-left text-xs leading-relaxed text-zinc-200 shadow-[0_16px_48px_rgba(0,0,0,0.85)] ring-1 ring-white/10 backdrop-blur-md"
              style={{ left: tipPos.left, top: tipPos.top, maxHeight: tipPos.maxH }}
              onPointerEnter={onTipPointerEnter}
              onPointerLeave={onTipPointerLeave}
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3 scrollbar-surface [scrollbar-gutter:stable] [color-scheme:dark]">
                {descForCard}
              </div>
            </div>,
            document.body,
          )
        : null}
      <div className="mt-4 grid gap-1.5 rounded-xl border border-white/[0.05] bg-black/30 px-3 py-2.5 font-mono text-[11px] text-zinc-500">
        <p>
          {t('models.input')}
          <span className="ml-1 tabular-nums text-cyan-200/90">{model.inputPerK}</span>
          {t('models.perK')}
        </p>
        <p>
          {t('models.output')}
          <span className="ml-1 tabular-nums text-violet-200/85">{model.outputPerK}</span>
          {model.outputPerK !== '—' ? t('models.perK') : ''}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t border-white/[0.06] pt-3 text-[11px]">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {model.tags.map((tag, i) => (
            <span
              key={`${model.id}-${i}-${tag}`}
              className="rounded-md border border-cyan-500/15 bg-cyan-500/[0.06] px-2 py-0.5 text-[10px] font-medium text-cyan-100/75"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`relative h-2 w-2 shrink-0 rounded-full ${
              model.healthy
                ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.65)] motion-safe:animate-pulse'
                : 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.45)]'
            }`}
            aria-hidden
          />
          <span
            className={
              model.healthy
                ? 'font-medium uppercase tracking-wide text-emerald-300/90'
                : 'font-medium uppercase tracking-wide text-amber-300/90'
            }
          >
            {model.healthy ? t('models.healthy') : t('models.maintenance')}
          </span>
        </div>
      </div>
    </article>
  )
}
