import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPenToSquare, faPlus, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons'
import {
  createSystemPlanConfig,
  deleteSystemPlanConfig,
  getSystemPlanConfig,
  listSystemPlanConfigs,
  updateSystemPlanConfig,
  type SystemPlanConfigRow,
} from '@/api/nexus/adminSystemConfig'
import { NexusBizError } from '@/api/errors'
import { copyTextToClipboard } from '@/lib/copyToClipboard'
import { notify } from '@/lib/toast'

const pageWrap = 'mx-auto w-full max-w-6xl px-4 py-6 md:px-8 lg:py-8'

const PAGE_SIZE = 10

const th = 'px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 md:px-4'
const td = 'border-t border-white/[0.06] px-3 py-3 text-xs text-zinc-200 md:px-4 md:text-sm'
/** 横向滚动时操作列贴右固定（需 table 使用 border-separate） */
const thActionsSticky =
  'sticky right-0 z-[2] min-w-[11rem] whitespace-nowrap bg-surface-850/95 text-right shadow-[inset_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-sm'
const tdActionsSticky =
  'sticky right-0 z-[1] min-w-[11rem] bg-surface-850/90 align-middle text-right shadow-[inset_1px_0_0_rgba(255,255,255,0.08)]'

function formatDisplayDate(iso: string, localeTag: string): string {
  if (!iso || iso === '—') return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(localeTag, { dateStyle: 'short', timeStyle: 'medium' })
}

function SystemConfigCategoryTag({ category }: { category: string }) {
  const raw = category.trim()
  const k = raw.toLowerCase()
  const palette: Record<string, string> = {
    business: 'border-sky-500/35 bg-sky-500/12 text-sky-100',
    mq: 'border-violet-500/35 bg-violet-500/12 text-violet-100',
    litellm: 'border-amber-500/40 bg-amber-500/12 text-amber-100',
  }
  const cls = palette[k] ?? 'border-white/[0.12] bg-white/[0.06] text-zinc-300'
  return (
    <span
      className={`inline-flex max-w-[10rem] truncate rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}
      title={raw || undefined}
    >
      {raw || '—'}
    </span>
  )
}

function editDraftsFromRow(row: SystemPlanConfigRow) {
  return {
    configKey: row.configKey === '—' ? '' : row.configKey,
    category: row.category === '—' ? '' : row.category,
    description: row.description === '—' ? '' : row.description,
    configValue: row.configValue === '—' ? '' : row.configValue,
    createdAt: row.createdAt === '—' ? '' : row.createdAt,
    updatedAt: row.updatedAt === '—' ? '' : row.updatedAt,
    isDeleted: row.isDeleted,
  }
}

type PagerProps = {
  page: number
  pageSize: number
  total: number
  pages: number
  loading: boolean
  onPageChange: (p: number) => void
}

function SystemConfigPager({ page, pageSize, total, pages, loading, onPageChange }: PagerProps) {
  const { t } = useTranslation()
  const totalPages = Math.max(1, pages)
  const safePage = Math.min(Math.max(1, page), totalPages)
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const to = total === 0 ? 0 : Math.min(safePage * pageSize, total)

  return (
    <div className="flex shrink-0 flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
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
  )
}

export function AdminSystemConfigPage() {
  const { t, i18n } = useTranslation()
  const localeTag = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'

  const [rows, setRows] = useState<SystemPlanConfigRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)

  const [editId, setEditId] = useState<number | null>(null)
  const [editModalRow, setEditModalRow] = useState<SystemPlanConfigRow | null>(null)
  const [editDetailLoading, setEditDetailLoading] = useState(false)
  const [draftConfigKey, setDraftConfigKey] = useState('')
  const [draftCategory, setDraftCategory] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftConfigValue, setDraftConfigValue] = useState('')
  const [draftCreatedAt, setDraftCreatedAt] = useState('')
  const [draftUpdatedAt, setDraftUpdatedAt] = useState('')
  const [draftIsDeleted, setDraftIsDeleted] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [newConfigKey, setNewConfigKey] = useState('')
  const [newConfigValue, setNewConfigValue] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newCategory, setNewCategory] = useState('business')
  const [newIsDeleted, setNewIsDeleted] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<SystemPlanConfigRow | null>(null)

  /** 每次打开/关闭编辑递增，用于忽略过期的详情请求并在 `finally` 中正确结束 loading */
  const editFetchTokenRef = useRef(0)

  const copyTableCell = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text || text === '—') return
      const ok = await copyTextToClipboard(text)
      if (ok) notify.success(t('admin.system.copyOk'))
      else notify.error(t('admin.system.copyFail'))
    },
    [t],
  )

  const loadRows = useCallback(async () => {
    setListLoading(true)
    try {
      const res = await listSystemPlanConfigs({ pageNum: currentPage, pageSize: PAGE_SIZE })
      setRows(res.rows)
      setTotal(res.total)
      setPages(Math.max(1, res.pages))
      setCurrentPage((prev) => Math.min(Math.max(1, prev), Math.max(1, res.pages)))
    } catch (e) {
      setRows([])
      setTotal(0)
      setPages(1)
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('admin.system.loadFail')
      notify.error(msg || t('admin.system.loadFail'))
    } finally {
      setListLoading(false)
    }
  }, [t, currentPage])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const openEdit = useCallback(
    (row: SystemPlanConfigRow) => {
      const token = ++editFetchTokenRef.current
      setCreateOpen(false)
      setEditId(row.id)
      setEditModalRow(row)
      const initial = editDraftsFromRow(row)
      setDraftConfigKey(initial.configKey)
      setDraftCategory(initial.category)
      setDraftDescription(initial.description)
      setDraftConfigValue(initial.configValue)
      setDraftCreatedAt(initial.createdAt)
      setDraftUpdatedAt(initial.updatedAt)
      setDraftIsDeleted(initial.isDeleted)
      setEditDetailLoading(true)
      void (async () => {
        try {
          const detail = await getSystemPlanConfig(row.id)
          if (token !== editFetchTokenRef.current) return
          setEditModalRow(detail)
          const d = editDraftsFromRow(detail)
          setDraftConfigKey(d.configKey)
          setDraftCategory(d.category)
          setDraftDescription(d.description)
          setDraftConfigValue(d.configValue)
          setDraftCreatedAt(d.createdAt)
          setDraftUpdatedAt(d.updatedAt)
          setDraftIsDeleted(d.isDeleted)
        } catch (e) {
          if (token !== editFetchTokenRef.current) return
          const msg =
            e instanceof NexusBizError
              ? e.message
              : e instanceof Error
                ? e.message
                : t('admin.system.loadFail')
          notify.error(msg || t('admin.system.loadFail'))
          setEditId(null)
          setEditModalRow(null)
        } finally {
          if (token === editFetchTokenRef.current) setEditDetailLoading(false)
        }
      })()
    },
    [t],
  )

  const closeEdit = useCallback(() => {
    editFetchTokenRef.current += 1
    setEditId(null)
    setEditModalRow(null)
    setEditDetailLoading(false)
  }, [])

  const openCreate = useCallback(() => {
    editFetchTokenRef.current += 1
    setEditId(null)
    setEditModalRow(null)
    setEditDetailLoading(false)
    setNewConfigKey('')
    setNewConfigValue('')
    setNewDescription('')
    setNewCategory('business')
    setNewIsDeleted(false)
    setCreateOpen(true)
  }, [])

  const closeCreate = useCallback(() => {
    setCreateOpen(false)
  }, [])

  const saveEdit = useCallback(async () => {
    if (editId == null) return
    const configKey = draftConfigKey.trim()
    if (!configKey) {
      notify.error(t('admin.system.configKeyRequired'))
      return
    }
    setSaveBusy(true)
    try {
      await updateSystemPlanConfig(editId, {
        id: editId,
        configKey,
        configValue: draftConfigValue,
        description: draftDescription,
        category: draftCategory.trim() || 'business',
        isDeleted: draftIsDeleted,
        createdAt: draftCreatedAt,
        updatedAt: draftUpdatedAt,
      })
      notify.success(t('admin.system.saveOk'))
      closeEdit()
      await loadRows()
    } catch (e) {
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('admin.system.saveFail')
      notify.error(msg || t('admin.system.saveFail'))
    } finally {
      setSaveBusy(false)
    }
  }, [
    editId,
    draftConfigKey,
    draftCategory,
    draftDescription,
    draftConfigValue,
    draftCreatedAt,
    draftUpdatedAt,
    draftIsDeleted,
    closeEdit,
    loadRows,
    t,
  ])

  const saveCreate = useCallback(async () => {
    const configKey = newConfigKey.trim()
    if (!configKey) {
      notify.error(t('admin.system.configKeyRequired'))
      return
    }
    setCreateBusy(true)
    try {
      await createSystemPlanConfig({
        configKey,
        configValue: newConfigValue,
        description: newDescription.trim(),
        category: newCategory.trim() || 'business',
        isDeleted: newIsDeleted,
      })
      notify.success(t('admin.system.createOk'))
      closeCreate()
      await loadRows()
    } catch (e) {
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('admin.system.createFail')
      notify.error(msg || t('admin.system.createFail'))
    } finally {
      setCreateBusy(false)
    }
  }, [newConfigKey, newConfigValue, newDescription, newCategory, newIsDeleted, closeCreate, loadRows, t])

  const openDeleteConfirm = useCallback((row: SystemPlanConfigRow) => {
    setDeleteConfirmRow(row)
  }, [])

  const closeDeleteConfirm = useCallback(() => {
    if (deletingId != null) return
    setDeleteConfirmRow(null)
  }, [deletingId])

  const executeDelete = useCallback(async () => {
    if (deleteConfirmRow == null) return
    const row = deleteConfirmRow
    setDeletingId(row.id)
    try {
      await deleteSystemPlanConfig(row.id)
      notify.success(t('admin.system.deleteOk'))
      setDeleteConfirmRow(null)
      if (editId === row.id) closeEdit()
      await loadRows()
    } catch (e) {
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('admin.system.deleteFail')
      notify.error(msg || t('admin.system.deleteFail'))
    } finally {
      setDeletingId(null)
    }
  }, [deleteConfirmRow, t, editId, closeEdit, loadRows])

  useEffect(() => {
    if (!createOpen && editId == null && deleteConfirmRow == null) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (deleteConfirmRow != null && deletingId == null) {
        setDeleteConfirmRow(null)
        return
      }
      if (createOpen) closeCreate()
      else if (editId != null) closeEdit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [createOpen, editId, deleteConfirmRow, deletingId, closeCreate, closeEdit])

  const colSpan = 7

  return (
    <div className={`${pageWrap} flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden`}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-surface-850/90">
        <div className="flex shrink-0 items-center justify-end border-b border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <button
            type="button"
            disabled={listLoading}
            onClick={() => openCreate()}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" aria-hidden />
            {t('admin.system.add')}
          </button>
        </div>
        <div className="scrollbar-admin-table min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-scroll">
          <div className="inline-block w-max min-w-[calc(100%+1px)] align-top">
            <table className="w-max min-w-[72rem] border-separate border-spacing-0 text-left text-sm">
            <thead className="sticky top-0 z-[1]">
              <tr className="border-b border-white/[0.08] bg-surface-850/95 backdrop-blur-sm">
                <th className={th}>{t('admin.system.colConfigKey')}</th>
                <th className={th}>{t('admin.system.colConfigValue')}</th>
                <th className={th}>{t('admin.system.colDescription')}</th>
                <th className={th}>{t('admin.system.colCategory')}</th>
                <th className={th}>{t('admin.system.colCreatedAt')}</th>
                <th className={th}>{t('admin.system.colUpdatedAt')}</th>
                <th className={`${th} ${thActionsSticky}`}>{t('admin.system.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan={colSpan} className={`${td} py-10 text-center text-zinc-500`}>
                    {t('console.common.loading')}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className={`${td} py-10 text-center text-zinc-500`}>
                    {t('admin.system.empty')}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="last:border-0">
                    <td className={`${td} max-w-[10rem]`}>
                      <button
                        type="button"
                        title={t('admin.system.clickToCopy')}
                        onClick={() => void copyTableCell(row.configKey)}
                        className="block w-full max-w-full cursor-pointer truncate rounded px-0.5 text-left font-mono text-zinc-300 transition hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
                      >
                        {row.configKey}
                      </button>
                    </td>
                    <td className={`${td} max-w-[14rem]`}>
                      <button
                        type="button"
                        title={t('admin.system.clickToCopy')}
                        onClick={() => void copyTableCell(row.configValue)}
                        className="block w-full max-w-full cursor-pointer break-all rounded px-0.5 text-left text-zinc-200 transition hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
                      >
                        {row.configValue}
                      </button>
                    </td>
                    <td className={`${td} max-w-[12rem] text-zinc-100`} title={row.description}>
                      {row.description}
                    </td>
                    <td className={td}>
                      <SystemConfigCategoryTag category={row.category} />
                    </td>
                    <td className={`${td} whitespace-nowrap tabular-nums text-zinc-400`}>
                      {formatDisplayDate(row.createdAt, localeTag)}
                    </td>
                    <td className={`${td} whitespace-nowrap tabular-nums text-zinc-400`}>
                      {formatDisplayDate(row.updatedAt, localeTag)}
                    </td>
                    <td className={`${td} ${tdActionsSticky}`}>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          disabled={listLoading || deletingId != null || deleteConfirmRow != null}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-violet-200 transition hover:border-violet-400/35 hover:bg-violet-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <FontAwesomeIcon icon={faPenToSquare} className="h-3 w-3 opacity-80" aria-hidden />
                          {t('admin.system.edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteConfirm(row)}
                          disabled={listLoading || deletingId != null || deleteConfirmRow != null}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/[0.08] px-2.5 py-1.5 text-xs font-medium text-rose-200 transition hover:border-rose-400/40 hover:bg-rose-500/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <FontAwesomeIcon icon={faTrash} className="h-3 w-3 opacity-80" aria-hidden />
                          {deletingId === row.id ? t('console.common.loading') : t('admin.system.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>

        <div className="shrink-0 border-t border-white/[0.08] bg-black/20 px-3 py-3 backdrop-blur-sm md:px-4">
          <SystemConfigPager
            page={currentPage}
            pageSize={PAGE_SIZE}
            total={total}
            pages={pages}
            loading={listLoading}
            onPageChange={(p) => setCurrentPage(p)}
          />
        </div>
      </div>

      {editId != null && editModalRow ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-3 py-6 backdrop-blur-[2px] sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEdit()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-system-edit-title"
            className="flex max-h-[min(40rem,calc(100vh-4rem))] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-surface-900/95 shadow-panel ring-1 ring-black/40"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5">
              <div className="min-w-0 flex-1">
                <h2 id="admin-system-edit-title" className="text-lg font-semibold text-white">
                  {t('admin.system.modalTitle')}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                disabled={saveBusy}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-50"
                aria-label={t('admin.system.closeModal')}
              >
                <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
              </button>
            </div>

            <div className="scrollbar-surface min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-4">
              {editDetailLoading ? (
                <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 text-sm text-zinc-500">
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" aria-hidden />
                  {t('console.common.loading')}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="admin-sys-edit-key" className="mb-1.5 block text-xs font-medium text-zinc-400">
                      {t('admin.system.colConfigKey')}
                    </label>
                    <input
                      id="admin-sys-edit-key"
                      type="text"
                      value={draftConfigKey}
                      onChange={(e) => setDraftConfigKey(e.target.value)}
                      disabled={saveBusy}
                      autoComplete="off"
                      className="w-full rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-sys-edit-cat" className="mb-1.5 block text-xs font-medium text-zinc-400">
                      {t('admin.system.colCategory')}
                    </label>
                    <input
                      id="admin-sys-edit-cat"
                      type="text"
                      value={draftCategory}
                      onChange={(e) => setDraftCategory(e.target.value)}
                      disabled={saveBusy}
                      className="w-full rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-sys-desc" className="mb-1.5 block text-xs font-medium text-zinc-400">
                      {t('admin.system.colDescription')}
                    </label>
                    <input
                      id="admin-sys-desc"
                      type="text"
                      value={draftDescription}
                      onChange={(e) => setDraftDescription(e.target.value)}
                      disabled={saveBusy}
                      className="w-full rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-sys-value" className="mb-1.5 block text-xs font-medium text-zinc-400">
                      {t('admin.system.colConfigValue')}
                    </label>
                    <textarea
                      id="admin-sys-value"
                      rows={4}
                      value={draftConfigValue}
                      onChange={(e) => setDraftConfigValue(e.target.value)}
                      disabled={saveBusy}
                      className="w-full resize-y rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-sys-edit-created" className="mb-1.5 block text-xs font-medium text-zinc-400">
                      {t('admin.system.colCreatedAt')}
                    </label>
                    <input
                      id="admin-sys-edit-created"
                      type="text"
                      value={draftCreatedAt}
                      onChange={(e) => setDraftCreatedAt(e.target.value)}
                      disabled={saveBusy}
                      className="w-full rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-sys-edit-updated" className="mb-1.5 block text-xs font-medium text-zinc-400">
                      {t('admin.system.colUpdatedAt')}
                    </label>
                    <input
                      id="admin-sys-edit-updated"
                      type="text"
                      value={draftUpdatedAt}
                      onChange={(e) => setDraftUpdatedAt(e.target.value)}
                      disabled={saveBusy}
                      className="w-full rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-white/[0.08] px-5 py-4">
              <button
                type="button"
                onClick={closeEdit}
                disabled={saveBusy || editDetailLoading}
                className="rounded-lg border border-white/[0.1] px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
              >
                {t('admin.system.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={saveBusy || editDetailLoading}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-50"
              >
                {saveBusy ? t('console.common.loading') : t('admin.system.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-3 py-6 backdrop-blur-[2px] sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeCreate()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-system-create-title"
            className="flex max-h-[min(40rem,calc(100vh-4rem))] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-surface-900/95 shadow-panel ring-1 ring-black/40"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5">
              <div className="min-w-0 flex-1">
                <h2 id="admin-system-create-title" className="text-lg font-semibold text-white">
                  {t('admin.system.modalCreateTitle')}
                </h2>
                <p className="mt-1 text-xs text-zinc-500">{t('admin.system.modalCreateHint')}</p>
              </div>
              <button
                type="button"
                onClick={closeCreate}
                disabled={createBusy}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-50"
                aria-label={t('admin.system.closeModal')}
              >
                <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
              </button>
            </div>

            <div className="scrollbar-surface min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-4">
              <div className="space-y-4">
                <div>
                  <label htmlFor="admin-sys-new-key" className="mb-1.5 block text-xs font-medium text-zinc-400">
                    {t('admin.system.colConfigKey')}
                  </label>
                  <input
                    id="admin-sys-new-key"
                    type="text"
                    value={newConfigKey}
                    onChange={(e) => setNewConfigKey(e.target.value)}
                    disabled={createBusy}
                    autoComplete="off"
                    className="w-full rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                  />
                </div>
              <div>
                <label htmlFor="admin-sys-new-cat" className="mb-1.5 block text-xs font-medium text-zinc-400">
                  {t('admin.system.colCategory')}
                </label>
                <input
                  id="admin-sys-new-cat"
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  disabled={createBusy}
                  className="w-full rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                />
              </div>
              <div>
                <label htmlFor="admin-sys-new-desc" className="mb-1.5 block text-xs font-medium text-zinc-400">
                  {t('admin.system.colDescription')}
                </label>
                <input
                  id="admin-sys-new-desc"
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  disabled={createBusy}
                  className="w-full rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                />
              </div>
              <div>
                <label htmlFor="admin-sys-new-val" className="mb-1.5 block text-xs font-medium text-zinc-400">
                  {t('admin.system.colConfigValue')}
                </label>
                <textarea
                  id="admin-sys-new-val"
                  rows={4}
                  value={newConfigValue}
                  onChange={(e) => setNewConfigValue(e.target.value)}
                  disabled={createBusy}
                  className="w-full resize-y rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={newIsDeleted}
                  onChange={(e) => setNewIsDeleted(e.target.checked)}
                  disabled={createBusy}
                  className="h-4 w-4 rounded border-white/20 bg-surface-850 text-accent focus:ring-accent/40"
                />
                {t('admin.system.markDeleted')}
              </label>
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-white/[0.08] px-5 py-4">
              <button
                type="button"
                onClick={closeCreate}
                disabled={createBusy}
                className="rounded-lg border border-white/[0.1] px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
              >
                {t('admin.system.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void saveCreate()}
                disabled={createBusy}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-50"
              >
                {createBusy ? t('console.common.loading') : t('admin.system.submitCreate')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmRow ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDeleteConfirm()
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="admin-system-delete-title"
            aria-describedby="admin-system-delete-desc"
            className="w-full max-w-sm rounded-2xl border border-white/[0.1] bg-surface-900/95 p-5 shadow-panel ring-1 ring-black/40"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="admin-system-delete-title" className="text-lg font-semibold text-white">
              {t('admin.system.deleteModalTitle')}
            </h2>
            <p id="admin-system-delete-desc" className="mt-3 text-sm leading-relaxed text-zinc-400">
              {t('admin.system.deleteConfirm', {
                key: deleteConfirmRow.configKey === '—' ? String(deleteConfirmRow.id) : deleteConfirmRow.configKey,
              })}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deletingId != null}
                className="rounded-lg border border-white/[0.1] px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('admin.system.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void executeDelete()}
                disabled={deletingId != null}
                className="rounded-lg border border-rose-500/35 bg-rose-500/15 px-4 py-2 text-sm font-medium text-rose-100 transition hover:border-rose-400/50 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingId != null ? t('console.common.loading') : t('admin.system.deleteModalConfirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
