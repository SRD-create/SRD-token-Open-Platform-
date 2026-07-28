import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEllipsisVertical, faXmark } from '@fortawesome/free-solid-svg-icons'
import { NexusBizError } from '@/api/errors'
import { pickPackageRow, userOwnedPackageIds } from '@/api/mappers/console'
import { listPackages, listUserPackages } from '@/api/nexus/packages'
import {
  mapApiKeyItemToRow,
  maskApiKeyForTableDisplay,
  pickCreatedApiKeySecret,
  type ApiKeyTableRow,
} from '@/api/mappers/apiKey'
import { createApiKey, deleteApiKey, listApiKeys } from '@/api/nexus/apiKeys'
import { useAuth } from '@/auth/useAuth'
import { ContentNotice } from '@/components/ContentNotice'
import { copyTextToClipboard } from '@/lib/copyToClipboard'
import { notify } from '@/lib/toast'

const pageWrap =
  'mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-6 overflow-y-auto px-4 py-6 scrollbar-surface md:gap-8 md:px-8 lg:py-8'

/** 名称 / Key（至少一截宽度，避免与「创建日期」贴太紧）/ 日期·操作 两列 `1fr` 分剩余宽；Key 单行 `max-content` 顶满 */
const tableRowGrid =
  'grid grid-cols-[minmax(0,1fr)_minmax(14rem,max-content)_minmax(0,1fr)_minmax(0,1fr)] items-stretch justify-items-start gap-x-4 gap-y-0 px-4 md:gap-x-6 md:px-6'

const tableHeaderGrid = `${tableRowGrid} shrink-0 border-b border-white/[0.06] py-3 text-left text-xs font-medium text-zinc-500`

/** 外层 `overflow-visible` 以便右上角下拉菜单不被裁切；流动背景收在 `packageCardDecorClip` 内 */
const packageCardOuter =
  'group relative flex h-fit w-full flex-col self-start overflow-visible rounded-2xl border border-white/[0.09] bg-zinc-950/75 shadow-[0_4px_28px_-6px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-white/[0.04] transition-all duration-300 ease-out hover:border-accent/45 hover:shadow-[0_12px_48px_-10px_rgba(139,92,246,0.28)] hover:ring-accent/15'

const packageCardDecorClip =
  'pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl'

/** 「计量」Tab 顶部「创建 API key」时随请求固定的目录套餐 id（按量套餐） */
const METERED_CATALOG_PACKAGE_ID = 4

export function ApiKeysPage() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { token } = useAuth()
  const titleId = useId()
  const localeTag = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'
  const [keys, setKeys] = useState<ApiKeyTableRow[]>([])
  const [keysLoading, setKeysLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [step, setStep] = useState<'form' | 'reveal'>('form')
  const [nameInput, setNameInput] = useState('')
  const [pendingSecret, setPendingSecret] = useState<string | null>(null)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ApiKeyTableRow | null>(null)
  const [panelTab, setPanelTab] = useState<'package' | 'metering'>('metering')

  useLayoutEffect(() => {
    const raw = searchParams.get('tab')
    if (raw !== 'package' && raw !== 'metering') return
    setPanelTab(raw)
    const next = new URLSearchParams(searchParams)
    next.delete('tab')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])
  const [createForPackageId, setCreateForPackageId] = useState<number | null>(null)
  const [createForPackageName, setCreateForPackageName] = useState<string | null>(null)
  const [ownedPackageCards, setOwnedPackageCards] = useState<ReturnType<typeof pickPackageRow>[]>([])
  const [ownedPackagesLoading, setOwnedPackagesLoading] = useState(false)
  /** 套餐卡片右上角「⋯」菜单：当前展开的套餐目录 id */
  const [openPackageCardMenuId, setOpenPackageCardMenuId] = useState<number | null>(null)

  const closeCreate = useCallback(() => {
    setCreateOpen(false)
    setStep('form')
    setNameInput('')
    setPendingSecret(null)
    setCreateForPackageId(null)
    setCreateForPackageName(null)
  }, [])

  const openCreateMetering = useCallback(() => {
    setCreateForPackageId(null)
    setCreateForPackageName(null)
    setCreateOpen(true)
    setStep('form')
    setNameInput('')
    setPendingSecret(null)
  }, [])

  const openCreateForPackage = useCallback((row: ReturnType<typeof pickPackageRow>) => {
    setCreateForPackageId(row.id)
    setCreateForPackageName(row.name)
    setCreateOpen(true)
    setStep('form')
    const preset = row.name.trim()
    setNameInput(preset && preset !== '—' ? preset : '')
    setPendingSecret(null)
  }, [])

  useEffect(() => {
    if (!createOpen) return
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') closeCreate()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [createOpen, closeCreate])

  useEffect(() => {
    setOpenPackageCardMenuId(null)
  }, [panelTab])

  useEffect(() => {
    if (openPackageCardMenuId == null) return
    const close = () => setOpenPackageCardMenuId(null)
    const onDocClick = (e: MouseEvent) => {
      const root = document.querySelector(`[data-package-menu-root="${openPackageCardMenuId}"]`)
      if (root?.contains(e.target as Node)) return
      close()
    }
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') close()
    }
    document.addEventListener('click', onDocClick, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onDocClick, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [openPackageCardMenuId])

  const reloadKeys = useCallback(async () => {
    if (!token) {
      setKeys([])
      setKeysLoading(false)
      return
    }
    setKeysLoading(true)
    try {
      const { items } = await listApiKeys({ limit: 100 })
      const rows = items
        .map((it) => mapApiKeyItemToRow(it, localeTag))
        .filter((r): r is ApiKeyTableRow => r !== null)
      setKeys(rows)
    } catch (e) {
      setKeys([])
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('console.apiKeys.toastLoadFail')
      notify.error(msg)
    } finally {
      setKeysLoading(false)
    }
  }, [token, localeTag, t])

  useEffect(() => {
    void reloadKeys()
  }, [reloadKeys])

  useEffect(() => {
    if (!token) {
      setOwnedPackageCards([])
      setOwnedPackagesLoading(false)
      return
    }
    let cancelled = false
    setOwnedPackagesLoading(true)
    void (async () => {
      try {
        const [p, u] = await Promise.all([
          listPackages({ limit: 100, offset: 0 }),
          listUserPackages({ limit: 100, offset: 0 }),
        ])
        if (cancelled) return
        const owned = userOwnedPackageIds(u.items)
        const rows = p.items
          .map((it) => pickPackageRow(it))
          .filter((r) => r.id > 0 && r.packageType === 'package' && owned.has(r.id))
        setOwnedPackageCards(rows)
      } catch (e) {
        if (cancelled) return
        setOwnedPackageCards([])
        const msg =
          e instanceof NexusBizError
            ? e.message
            : e instanceof Error
              ? e.message
              : t('console.apiKeys.packageTabLoadFail')
        notify.error(msg)
      } finally {
        if (!cancelled) setOwnedPackagesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, t])

  const submitCreate = async () => {
    const name = nameInput.trim()
    if (!name) {
      notify.error(t('console.apiKeys.toastNameRequired'))
      return
    }
    setCreateSubmitting(true)
    try {
      const raw = await createApiKey(
        createForPackageId != null && createForPackageId > 0
          ? { name, package_id: createForPackageId }
          : { name, package_id: METERED_CATALOG_PACKAGE_ID },
      )
      const secret = pickCreatedApiKeySecret(raw)
      if (secret) {
        setPendingSecret(secret)
        setStep('reveal')
        notify.success(t('console.apiKeys.toastCreated'))
      } else {
        notify.success(t('console.apiKeys.toastCreated'))
        closeCreate()
      }
      await reloadKeys()
    } catch (e) {
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('console.apiKeys.toastCreateFail')
      notify.error(msg)
    } finally {
      setCreateSubmitting(false)
    }
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void submitCreate()
  }

  const copySecret = async () => {
    if (!pendingSecret) return
    const ok = await copyTextToClipboard(pendingSecret)
    if (ok) {
      notify.success(t('console.apiKeys.toastCopied'))
    } else {
      notify.error(t('console.apiKeys.toastCopyFail'))
    }
  }

  const backdropClose = () => {
    closeCreate()
  }

  const modalCloseBtn = (
    <button
      type="button"
      className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
      aria-label={t('console.common.close')}
      onClick={closeCreate}
    >
      <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
    </button>
  )

  const copyRowKey = useCallback(
    async (row: ApiKeyTableRow) => {
      const text = row.copyKey.trim()
      if (!text || text === '—') return
      const ok = await copyTextToClipboard(text)
      if (ok) notify.success(t('console.apiKeys.toastCopied'))
      else notify.error(t('console.apiKeys.toastCopyFail'))
    },
    [t],
  )

  /** 「计量」Tab：仅展示接口中 `package_type` 为按量（common）的密钥 */
  const meteringRows = useMemo(
    () => keys.filter((row) => (row.packageType ?? '').toLowerCase() === 'common'),
    [keys],
  )

  /**
   * 「套餐」Tab：每张已购套餐卡片上展示的 key =
   * `package_type` 为 package 且 `package_id` 与该卡片目录套餐 `id` 相同（通常每卡一条，这里取首条）
   */
  const apiKeyRowByPackageId = useMemo(() => {
    const m = new Map<number, ApiKeyTableRow>()
    for (const row of keys) {
      if ((row.packageType ?? '').toLowerCase() !== 'package') continue
      if (row.packageId == null) continue
      if (!m.has(row.packageId)) m.set(row.packageId, row)
    }
    return m
  }, [keys])

  const removeApiKey = async (row: ApiKeyTableRow): Promise<boolean> => {
    const idNum = Number.parseInt(row.id, 10)
    if (!Number.isFinite(idNum) || idNum <= 0) {
      notify.error(t('console.apiKeys.toastDeleteFail'))
      return false
    }
    setDeletingId(row.id)
    try {
      await deleteApiKey(idNum)
      notify.success(t('console.apiKeys.toastDeleted'))
      await reloadKeys()
      return true
    } catch (e) {
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('console.apiKeys.toastDeleteFail')
      notify.error(msg)
      return false
    } finally {
      setDeletingId(null)
    }
  }

  const meteringTable = useMemo(
    () => (
      <div className="flex min-h-0 min-w-[440px] flex-1 flex-col sm:min-w-0">
        <div className={tableHeaderGrid}>
          <span className="flex min-w-0 w-full items-center">{t('console.apiKeys.colName')}</span>
          <span className="flex items-center whitespace-nowrap">{t('console.apiKeys.colKey')}</span>
          <span className="flex min-w-0 w-full items-center whitespace-nowrap">
            {t('console.apiKeys.colCreated')}
          </span>
          <span className="flex min-w-0 w-full items-center">{t('console.apiKeys.colActions')}</span>
        </div>
        {keysLoading ? (
          <div className="scrollbar-surface flex min-h-0 flex-1 items-center justify-center px-4 py-8 text-center text-sm text-zinc-500">
            {t('console.common.loading')}
          </div>
        ) : meteringRows.length === 0 ? (
          <div className="scrollbar-surface flex min-h-0 flex-1 items-center justify-center px-4 py-8 text-center text-sm text-zinc-500">
            {t('console.apiKeys.empty')}
          </div>
        ) : (
          <div className="scrollbar-surface min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-gutter:stable]">
            <ul className="divide-y divide-white/[0.06]">
              {meteringRows.map((row) => (
                <li
                  key={row.id}
                  className={`${tableRowGrid} py-3 text-left text-sm text-zinc-300`}
                >
                  <span className="flex min-w-0 w-full items-center truncate font-medium leading-snug text-zinc-100">
                    {row.name}
                  </span>
                  <div className="flex max-w-full items-center justify-self-start">
                    <div className="inline-flex max-w-full items-center rounded-full border border-white/[0.1] bg-zinc-800/85 px-3 py-1 shadow-inner shadow-black/20">
                      <button
                        type="button"
                        title={
                          !row.copyKey.trim() || row.copyKey === '—'
                            ? undefined
                            : `${t('console.apiKeys.copyKeyHoverHint')}\n${row.copyKey}`
                        }
                        disabled={!row.copyKey.trim() || row.copyKey === '—'}
                        onClick={() => void copyRowKey(row)}
                        className="m-0 max-w-full cursor-pointer whitespace-nowrap p-0 text-left font-mono text-[0.8125rem] leading-normal tracking-tight text-zinc-100 transition hover:text-accent-glow disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {maskApiKeyForTableDisplay(row.copyKey)}
                      </button>
                    </div>
                  </div>
                  <span className="flex min-w-0 w-full items-center whitespace-nowrap tabular-nums leading-snug text-zinc-500">
                    {row.createdAt}
                  </span>
                  <span className="flex min-w-0 w-full items-center justify-self-stretch justify-start">
                    <button
                      type="button"
                      disabled={deletingId === row.id}
                      onClick={() => setDeleteTarget(row)}
                      className="rounded-lg border border-red-500/35 bg-red-500/10 px-2.5 py-1 text-xs text-red-300 transition hover:border-red-400/55 hover:bg-red-500/15 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingId === row.id ? t('console.common.loading') : t('console.apiKeys.delete')}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    ),
    [
      t,
      keysLoading,
      meteringRows,
      deletingId,
      copyRowKey,
    ],
  )

  return (
    <div className={pageWrap}>
      <div className="shrink-0 space-y-3">
        <ContentNotice>
          <p>{t('console.apiKeys.notice')}</p>
        </ContentNotice>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <LayoutGroup>
            <div
              className="inline-flex w-fit shrink-0 items-center gap-1 rounded-xl border border-white/[0.08] bg-surface-900/50 p-1"
              role="tablist"
              aria-label={t('console.apiKeys.tabAria')}
            >
              <button
                type="button"
                role="tab"
                aria-selected={panelTab === 'package'}
                className={[
                  'relative min-h-10 shrink-0 overflow-hidden rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200',
                  panelTab === 'package'
                    ? 'text-accent-glow'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200',
                ].join(' ')}
                onClick={() => setPanelTab('package')}
              >
                {panelTab === 'package' ? (
                  <motion.span
                    layoutId="apiKeysTabIndicator"
                    className="pointer-events-none absolute inset-0 z-0 rounded-lg bg-accent/20 ring-1 ring-accent/35"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="relative z-10">{t('console.apiKeys.tabPackage')}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={panelTab === 'metering'}
                className={[
                  'relative min-h-10 shrink-0 overflow-hidden rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200',
                  panelTab === 'metering'
                    ? 'text-accent-glow'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200',
                ].join(' ')}
                onClick={() => setPanelTab('metering')}
              >
                {panelTab === 'metering' ? (
                  <motion.span
                    layoutId="apiKeysTabIndicator"
                    className="pointer-events-none absolute inset-0 z-0 rounded-lg bg-accent/20 ring-1 ring-accent/35"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="relative z-10">{t('console.apiKeys.tabMetering')}</span>
              </button>
            </div>
          </LayoutGroup>
          {panelTab === 'metering' ? (
            <button
              type="button"
              className="min-h-10 shrink-0 self-end rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-100 sm:self-auto"
              onClick={openCreateMetering}
            >
              {t('console.apiKeys.createHeaderBtn')}
            </button>
          ) : (
            <span className="hidden min-h-10 sm:block" aria-hidden />
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-surface-850/80">
        <div className="-mx-4 flex min-h-0 flex-1 flex-col overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={panelTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-h-0 flex-1 flex-col"
            >
              {panelTab === 'metering' ? (
                meteringTable
              ) : ownedPackagesLoading ? (
                <div className="flex min-h-[12rem] flex-1 items-center justify-center px-4 py-8 text-sm text-zinc-500">
                  {t('console.common.loading')}
                </div>
              ) : ownedPackageCards.length === 0 ? (
                <div className="flex min-h-[12rem] flex-1 items-center justify-center px-4 py-8 text-center text-sm text-zinc-500">
                  {t('console.apiKeys.packageTabEmpty')}
                </div>
              ) : (
                <div className="scrollbar-surface grid min-h-0 flex-1 auto-rows-min grid-cols-1 content-start items-stretch gap-4 overflow-auto overscroll-contain p-4 pb-5 sm:grid-cols-2 sm:gap-5 sm:p-6 lg:grid-cols-3">
                  {ownedPackageCards.map((tier) => {
                    const pkgBoundRow = apiKeyRowByPackageId.get(tier.id)
                    const hasPackageKeyMatch = pkgBoundRow != null
                    const canShowMaskedPackageKey =
                      pkgBoundRow != null &&
                      pkgBoundRow.copyKey.trim() !== '' &&
                      pkgBoundRow.copyKey !== '—'
                    return (
                    <div key={tier.id} className={packageCardOuter}>
                      <div className={packageCardDecorClip} aria-hidden>
                        <div className="api-keys-package-card-mesh" />
                        <div
                          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-violet-500/26 blur-2xl transition-opacity duration-500 group-hover:opacity-100 api-keys-package-card-flow-violet"
                          aria-hidden
                        />
                        <div
                          className="pointer-events-none absolute -bottom-12 -left-14 h-36 w-44 rounded-full bg-cyan-500/18 blur-2xl transition-opacity duration-500 group-hover:opacity-100 api-keys-package-card-flow-cyan"
                          aria-hidden
                        />
                        <div
                          className="pointer-events-none absolute right-[-18%] top-1/2 h-32 w-40 -translate-y-1/2 rounded-full bg-fuchsia-500/18 blur-2xl transition-opacity duration-500 group-hover:opacity-100 api-keys-package-card-flow-fuchsia"
                          aria-hidden
                        />
                        <div
                          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-accent/[0.06] api-keys-package-card-sheen"
                          aria-hidden
                        />
                      </div>
                      <div className="relative z-10 flex min-h-[11.25rem] flex-col p-5 sm:min-h-[12rem]">
                        <div className="flex items-start justify-between gap-2.5">
                          <h3 className="min-w-0 flex-1 bg-gradient-to-r from-zinc-100 via-white to-zinc-200 bg-clip-text pr-1 text-sm font-semibold leading-snug text-transparent md:text-base">
                            {tier.name}
                          </h3>
                          <div
                            className="relative shrink-0"
                            data-package-menu-root={tier.id}
                          >
                            <button
                              type="button"
                              aria-label={t('console.apiKeys.packageCardMenuAria')}
                              aria-expanded={openPackageCardMenuId === tier.id}
                              aria-haspopup="menu"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenPackageCardMenuId((id) => (id === tier.id ? null : tier.id))
                              }}
                            >
                              <FontAwesomeIcon icon={faEllipsisVertical} className="h-4 w-4" />
                            </button>
                            {openPackageCardMenuId === tier.id ? (
                              <div
                                role="menu"
                                className="absolute right-0 top-full z-[80] mt-1 w-[8.75rem] rounded-lg border border-white/[0.12] bg-zinc-900/98 py-1 shadow-xl shadow-black/50 ring-1 ring-white/[0.06] backdrop-blur-sm sm:w-36"
                              >
                                <button
                                  role="menuitem"
                                  type="button"
                                  disabled={hasPackageKeyMatch}
                                  className="flex w-full px-3 py-2 text-left text-xs text-zinc-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent sm:text-sm"
                                  onClick={() => {
                                    if (hasPackageKeyMatch) return
                                    setOpenPackageCardMenuId(null)
                                    openCreateForPackage(tier)
                                  }}
                                >
                                  {t('console.apiKeys.createOnCardBtn')}
                                </button>
                                <button
                                  role="menuitem"
                                  type="button"
                                  disabled={!hasPackageKeyMatch || !pkgBoundRow}
                                  className="flex w-full px-3 py-2 text-left text-xs text-red-300/95 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent sm:text-sm"
                                  onClick={() => {
                                    if (!pkgBoundRow) return
                                    setOpenPackageCardMenuId(null)
                                    setDeleteTarget(pkgBoundRow)
                                  }}
                                >
                                  {t('console.apiKeys.deleteOnCardBtn')}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-3.5 flex flex-wrap items-baseline gap-1">
                          <span className="bg-gradient-to-r from-violet-200 via-white to-cyan-200 bg-clip-text text-lg font-bold tracking-tight text-transparent md:text-xl">
                            {tier.priceLabel}
                          </span>
                        </p>
                        {canShowMaskedPackageKey && pkgBoundRow ? (
                          <div className="mt-auto flex min-w-0 items-center gap-2.5 pt-4">
                            <span
                              className="inline-flex max-w-[46%] shrink-0 items-center truncate rounded-md bg-violet-500/25 px-2 py-0.5 text-[11px] font-medium leading-tight text-violet-100 ring-1 ring-inset ring-violet-400/30"
                              title={
                                pkgBoundRow.name.trim() && pkgBoundRow.name !== '—'
                                  ? pkgBoundRow.name
                                  : undefined
                              }
                            >
                              {pkgBoundRow.name.trim() && pkgBoundRow.name !== '—' ? pkgBoundRow.name : '—'}
                            </span>
                            <button
                              type="button"
                              title={`${t('console.apiKeys.copyKeyHoverHint')}\n${pkgBoundRow.copyKey}`}
                              onClick={() => void copyRowKey(pkgBoundRow)}
                              className="min-w-0 flex-1 cursor-pointer truncate border-0 bg-transparent p-0 text-left font-mono text-[0.8125rem] font-normal leading-normal tracking-tight text-white shadow-none outline-none ring-0 transition hover:text-zinc-100 hover:underline focus-visible:underline"
                            >
                              {maskApiKeyForTableDisplay(pkgBoundRow.copyKey)}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) backdropClose()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative max-h-[min(100dvh-1rem,720px)] w-full max-w-md overflow-y-auto overscroll-y-contain rounded-2xl border border-white/[0.1] bg-surface-850 p-6 pt-5 shadow-2xl shadow-black/40"
          >
            {modalCloseBtn}
            {step === 'form' ? (
              <form onSubmit={handleFormSubmit}>
                <h2 id={titleId} className="pr-10 text-lg font-semibold text-zinc-100">
                  {t('console.apiKeys.modalFormTitle')}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {createForPackageId != null && createForPackageId > 0 && createForPackageName
                    ? t('console.apiKeys.modalFormHintPackage', { name: createForPackageName })
                    : t('console.apiKeys.modalFormHint')}
                </p>
                <label className="mt-5 block text-xs font-medium text-zinc-400">
                  {t('console.apiKeys.labelName')}
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder={t('console.apiKeys.placeholderName')}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-surface-950/80 px-3 py-2 text-base text-zinc-100 outline-none ring-accent/40 placeholder:text-zinc-600 focus:border-accent/40 focus:ring-2 md:text-sm"
                    autoFocus
                    autoComplete="off"
                  />
                </label>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-full px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
                    onClick={closeCreate}
                  >
                    {t('console.apiKeys.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={createSubmitting}
                    className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void submitCreate()}
                  >
                    {createSubmitting ? t('console.common.loading') : t('console.apiKeys.create')}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <h2 id={titleId} className="pr-10 text-lg font-semibold text-zinc-100">
                  {t('console.apiKeys.modalRevealTitle')}
                </h2>
                <div className="mt-4 rounded-lg border border-white/[0.08] bg-surface-950/80 p-3">
                  <code className="block select-text break-all font-mono text-xs leading-relaxed text-accent-glow">
                    {pendingSecret}
                  </code>
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-100"
                    onClick={copySecret}
                  >
                    {t('console.apiKeys.copy')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDeleteTarget(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-sm rounded-2xl border border-white/[0.1] bg-surface-850 p-5 shadow-2xl shadow-black/40"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="pr-10 text-base font-semibold text-zinc-100">{t('console.apiKeys.delete')}</h3>
            <p className="mt-2 text-sm text-zinc-400">
              {t('console.apiKeys.deleteConfirm', { name: deleteTarget.name })}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-full px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
                onClick={() => setDeleteTarget(null)}
              >
                {t('console.apiKeys.cancel')}
              </button>
              <button
                type="button"
                disabled={deletingId === deleteTarget.id}
                className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  void (async () => {
                    const ok = await removeApiKey(deleteTarget)
                    if (ok) setDeleteTarget(null)
                  })()
                }}
              >
                {deletingId === deleteTarget.id ? t('console.common.loading') : t('console.apiKeys.delete')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
