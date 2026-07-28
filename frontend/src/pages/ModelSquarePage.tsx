import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons'
import {
  fetchModelServiceProviders,
  fetchModelServicesPage,
  fetchModelServiceTypes,
  type ModelServiceRecord,
  type ModelSquareOption,
} from '@/api/modelSquare'
import { ModelDetailModal } from '@/components/ModelDetailModal'
import { ModelSquareMarketCard } from '@/components/ModelSquareMarketCard'
import { VendorMark } from '@/components/VendorMark'
import { mapRecordToModelItem, type ModelItem } from '@/modelSquare/modelItem'
import { notify } from '@/lib/toast'
import {
  landingContentShellClass,
  landingModelSquarePaddingTopClass,
} from '@/landing/landingContentShell'

/**
 * 大屏：主行高度 = 视口 − 顶栏垫片实高（`--landing-header-offset`）− 与 pageWrap 一致的上下内边距（lg: pt-10 + pb-7）。
 * 顶栏在 Layout 中已用占位条占用高度，故不得再写死 8.25rem，否则会略大于剩余空间、整页出现额外滚动条。
 */
const pageWrap = `${landingContentShellClass} flex min-h-0 flex-col ${landingModelSquarePaddingTopClass} pb-4 sm:pb-5 md:pb-6 lg:min-h-0 lg:pb-7`
const mainRowLg =
  'lg:min-h-0 lg:shrink-0 lg:overflow-hidden lg:h-[calc(100dvh-var(--landing-header-offset,72px)-2.5rem-1.75rem)] lg:max-h-[calc(100dvh-var(--landing-header-offset,72px)-2.5rem-1.75rem)]'

const PAGE_SIZE = 6

export function ModelSquareMain() {
  const { t } = useTranslation()
  const [typeSource, setTypeSource] = useState<ModelSquareOption[]>([])
  const [vendorSource, setVendorSource] = useState<ModelSquareOption[]>([])
  const [filtersLoading, setFiltersLoading] = useState(true)

  const [typeId, setTypeId] = useState<string>('all')
  const [vendorId, setVendorId] = useState<string>('all')
  const [page, setPage] = useState(1)

  const [models, setModels] = useState<ModelItem[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [listLoading, setListLoading] = useState(true)
  const [detailModel, setDetailModel] = useState<ModelItem | null>(null)
  /** 小屏默认收起筛选，便于先浏览列表；≥lg 始终展开 */
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia('(min-width: 1024px)').matches
  })

  const mapRecord = useCallback((r: ModelServiceRecord) => mapRecordToModelItem(r, t), [t])

  const typeChips = useMemo(
    () => [{ value: 'all', label: t('models.type.all') }, ...typeSource],
    [typeSource, t],
  )
  const vendorChips = useMemo(
    () => [{ value: 'all', label: t('models.vendor.all') }, ...vendorSource],
    [vendorSource, t],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setFiltersLoading(true)
      try {
        const [types, providers] = await Promise.all([
          fetchModelServiceTypes(),
          fetchModelServiceProviders(),
        ])
        if (!cancelled) {
          setTypeSource(types)
          setVendorSource(providers)
        }
      } catch {
        if (!cancelled) notify.error(t('models.loadFiltersError'))
      } finally {
        if (!cancelled) setFiltersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [t])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setListLoading(true)
      try {
        const payload = await fetchModelServicesPage({
          pageNum: page,
          pageSize: PAGE_SIZE,
          modelType: typeId === 'all' ? undefined : typeId,
          provider: vendorId === 'all' ? undefined : vendorId,
        })
        if (cancelled) return

        const computedPages =
          payload.pages >= 1
            ? payload.pages
            : payload.total > 0
              ? Math.ceil(payload.total / Math.max(1, payload.size))
              : 1
        const maxPage = Math.max(1, computedPages)
        if (page > maxPage) {
          setPage(maxPage)
          return
        }

        setTotal(payload.total)
        setTotalPages(maxPage)
        setModels(payload.records.map(mapRecord))
      } catch {
        if (!cancelled) {
          setModels([])
          setTotal(0)
          setTotalPages(1)
          notify.error(t('models.loadListError'))
        }
      } finally {
        if (!cancelled) setListLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [page, typeId, vendorId, mapRecord, t])

  const currentPage = Math.min(Math.max(1, page), totalPages)
  const from = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const to = Math.min(currentPage * PAGE_SIZE, total)

  const filterChipBase =
    'min-h-11 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 sm:min-h-0 sm:py-2'
  const filterChipInactive =
    'border border-white/[0.06] bg-black/35 text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-cyan-500/20 hover:text-zinc-200'
  const filterChipActive =
    'border border-cyan-400/35 bg-gradient-to-br from-cyan-500/[0.12] via-violet-600/[0.08] to-transparent text-cyan-50 shadow-[0_0_24px_-8px_rgba(34,211,238,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]'

  return (
    <div className={pageWrap}>
      <div
        className={`relative isolate flex min-h-0 flex-col gap-3 sm:gap-4 lg:flex-row lg:items-stretch lg:gap-6 ${mainRowLg}`}
      >
        <div
          className="model-square-backdrop-grid pointer-events-none absolute inset-0 -z-10 opacity-[0.65] sm:opacity-80"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-[20%] top-1/2 -z-10 h-[min(90%,42rem)] w-[min(90vw,48rem)] -translate-y-1/2 rounded-full bg-cyan-500/[0.07] blur-[100px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-[15%] bottom-0 -z-10 h-[min(70%,28rem)] w-[min(80vw,36rem)] translate-y-1/4 rounded-full bg-violet-600/[0.08] blur-[90px]"
          aria-hidden
        />

        <button
          type="button"
          aria-expanded={filtersPanelOpen}
          onClick={() => setFiltersPanelOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-cyan-500/20 bg-zinc-950/60 px-4 py-3.5 text-left text-sm font-medium text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm transition active:scale-[0.99] hover:border-cyan-500/35 lg:hidden min-h-12"
        >
          <span>{filtersPanelOpen ? t('models.filtersCollapse') : t('models.filtersExpand')}</span>
          <FontAwesomeIcon
            icon={filtersPanelOpen ? faChevronUp : faChevronDown}
            className="h-4 w-4 shrink-0 text-cyan-400/85"
            aria-hidden
          />
        </button>

        <aside
          className={`relative ${filtersPanelOpen ? 'flex' : 'hidden lg:flex'} min-h-0 w-full shrink-0 flex-col gap-5 overflow-hidden rounded-2xl border border-cyan-500/15 bg-zinc-950/55 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_80px_-24px_rgba(0,0,0,0.75)] backdrop-blur-2xl sm:gap-6 md:p-5 lg:w-[15.5rem] lg:min-h-0 xl:w-[17rem]`}
        >
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-cyan-500/[0.04] via-transparent to-violet-600/[0.05]" />
          <div className="relative shrink-0">
            <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-400/75">
              {t('models.filterType')}
            </h3>
            <div
              className={`mt-3 flex flex-wrap gap-2 ${filtersLoading ? 'pointer-events-none opacity-45' : ''}`}
            >
              {typeChips.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setTypeId(opt.value)
                    setPage(1)
                    setFiltersPanelOpen(false)
                  }}
                  className={`${filterChipBase} ${typeId === opt.value ? filterChipActive : filterChipInactive}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <h3 className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300/70">
              {t('models.filterVendor')}
            </h3>
            <div className="scrollbar-surface mt-3 min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-1 [-webkit-overflow-scrolling:touch] max-h-[min(38vh,22rem)] sm:max-h-[min(420px,50vh)] lg:max-h-none">
              <div
                className={`flex flex-wrap gap-2 ${filtersLoading ? 'pointer-events-none opacity-45' : ''}`}
              >
                {vendorChips.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setVendorId(opt.value)
                      setPage(1)
                      setFiltersPanelOpen(false)
                    }}
                    className={`inline-flex max-w-full min-h-11 items-center gap-2 rounded-lg py-2 pl-2 pr-3 text-xs font-medium transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 sm:min-h-0 ${
                      vendorId === opt.value ? filterChipActive : filterChipInactive
                    }`}
                  >
                    <VendorMark id={opt.value} size="xs" />
                    <span className="truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/50 shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_32px_90px_-28px_rgba(0,0,0,0.85)] backdrop-blur-xl lg:min-h-0">
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-40 model-square-backdrop-grid"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/35 to-transparent"
            aria-hidden
          />

          {listLoading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/75 backdrop-blur-md">
              <div className="flex flex-col items-center gap-4">
                <div
                  className="h-11 w-11 rounded-full border-2 border-cyan-500/15 border-t-cyan-400 shadow-[0_0_24px_rgba(34,211,238,0.25)] motion-safe:animate-spin"
                  aria-hidden
                />
                <p className="max-w-[14rem] text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.2em] text-cyan-200/55">
                  {t('models.listLoading')}
                </p>
              </div>
            </div>
          ) : null}

          <div className="scrollbar-surface relative z-[1] flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
            {total === 0 && !listLoading ? (
              <div className="flex min-h-[min(320px,50vh)] flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center md:min-h-0">
                <div
                  className="h-16 w-16 rounded-2xl border border-dashed border-cyan-500/25 bg-cyan-500/[0.03] shadow-[inset_0_0_40px_rgba(34,211,238,0.06)]"
                  aria-hidden
                />
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">
                  {t('models.empty')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 px-3 py-4 sm:gap-4 sm:px-4 sm:py-5 md:grid-cols-2 md:gap-5 md:px-6 md:py-6 xl:grid-cols-3">
                {models.map((m) => (
                  <ModelSquareMarketCard key={m.id} model={m} onOpenDetail={setDetailModel} />
                ))}
              </div>
            )}
          </div>

          <div className="relative z-[1] mt-0 shrink-0 border-t border-cyan-500/10 bg-black/40 px-3 py-3 backdrop-blur-md sm:px-4 sm:py-4 md:px-6 md:py-5">
            <div className="flex flex-col items-center justify-between gap-3 text-sm text-zinc-500 sm:flex-row sm:gap-4">
              <p className="text-center font-mono text-[11px] tabular-nums tracking-wide text-zinc-500 sm:text-xs sm:text-left">
                {t('models.range', { from, to, total })}
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1 || listLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/[0.1] bg-black/30 px-4 font-mono text-xs font-medium uppercase tracking-wider text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-cyan-500/25 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-35 sm:min-h-0 sm:min-w-0 sm:px-3 sm:py-2"
                >
                  {t('models.prev')}
                </button>
                <span className="inline-flex min-h-11 min-w-[4.75rem] items-center justify-center rounded-lg border border-cyan-400/30 bg-gradient-to-b from-cyan-500/15 to-violet-600/10 px-3 font-mono text-xs font-semibold tabular-nums text-cyan-100 shadow-[0_0_20px_-8px_rgba(34,211,238,0.35)] sm:min-h-0 sm:py-2">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages || listLoading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/[0.1] bg-black/30 px-4 font-mono text-xs font-medium uppercase tracking-wider text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-cyan-500/25 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-35 sm:min-h-0 sm:min-w-0 sm:px-3 sm:py-2"
                >
                  {t('models.next')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ModelDetailModal model={detailModel} onClose={() => setDetailModel(null)} />
    </div>
  )
}

export function ModelSquarePage() {
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <main className="relative z-10 min-h-0 flex-1">
      <ModelSquareMain />
    </main>
  )
}
