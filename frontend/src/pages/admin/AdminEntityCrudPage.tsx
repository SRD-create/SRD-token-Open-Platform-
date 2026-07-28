import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { i18n as I18nApi } from 'i18next'
import type { TFunction } from 'i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPenToSquare, faPlus, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons'
import type { AdminEntityRow, AdminPagedParams, AdminPagedResult } from '@/api/nexus/adminPagedResource'
import { NexusBizError } from '@/api/errors'
import { copyTextToClipboard } from '@/lib/copyToClipboard'
import { notify } from '@/lib/toast'

const pageWrap = 'mx-auto w-full max-w-6xl px-4 py-6 md:px-8 lg:py-8'
const PAGE_SIZE = 10
const th = 'px-3 py-3 text-left text-xs font-medium tracking-wide text-zinc-500 md:px-4'
const td = 'border-t border-white/[0.06] px-3 py-3 text-xs text-zinc-200 md:px-4 md:text-sm'
const thActionsSticky =
  'sticky right-0 z-[2] min-w-[11rem] whitespace-nowrap bg-surface-850/95 text-right shadow-[inset_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-sm'
const tdActionsSticky =
  'sticky right-0 z-[1] min-w-[11rem] bg-surface-850/90 align-middle text-right shadow-[inset_1px_0_0_rgba(255,255,255,0.08)]'

const DEFAULT_CREATE_OMIT = ['id', 'created_at', 'updated_at', 'createdAt', 'updatedAt'] as const
const DEFAULT_EXCLUDE_COLUMN_KEYS: readonly string[] = []

function formatDisplayDate(iso: string, localeTag: string): string {
  if (!iso || iso === '—') return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(localeTag, { dateStyle: 'short', timeStyle: 'medium' })
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, ' ')
}

/** camelCase → snake_case，便于与 zh 里 `field.commission_rate` 一类 key 对齐 */
function toSnakeFieldKey(key: string): string {
  return key
    .replace(/([A-Z])/g, '_$1')
    .replace(/^_/, '')
    .toLowerCase()
}

function resolveFieldLabel(key: string, i18nPrefix: string, t: TFunction, i18n: I18nApi): string {
  const snake = toSnakeFieldKey(key)
  for (const c of Array.from(new Set([key, snake]))) {
    const full = `${i18nPrefix}.field.${c}`
    if (i18n.exists(full)) return t(full)
  }
  return humanizeKey(key)
}

function getFormSelectOptions(
  key: string,
  map: Readonly<Record<string, readonly string[]>> | undefined,
): readonly string[] | undefined {
  if (!map) return undefined
  const direct = map[key]
  if (direct?.length) return direct
  const snake = toSnakeFieldKey(key)
  const bySnake = map[snake]
  if (bySnake?.length) return bySnake
  return undefined
}

/** 草稿中列出的键若为非负数字段且解析为负数，返回该键 */
function firstNegativeNumericFieldKey(
  draft: Record<string, string>,
  nonNegSet: Set<string>,
): string | null {
  for (const key of Object.keys(draft)) {
    if (!nonNegSet.has(key)) continue
    const raw = String(draft[key] ?? '').trim()
    if (!raw) continue
    const n = Number.parseFloat(raw)
    if (Number.isFinite(n) && n < 0) return key
  }
  return null
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function formatCell(v: unknown, localeTag: string): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? '✓' : '—'
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(v) || /T\d{2}:\d{2}/.test(v)) return formatDisplayDate(v, localeTag)
    return v || '—'
  }
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return '—'
    }
  }
  return String(v)
}

function inferColumnKeys(rows: AdminEntityRow[]): string[] {
  const s = new Set<string>()
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (k === 'id' || k === 'Id') continue
      s.add(k)
    }
  }
  return [...s].sort((a, b) => a.localeCompare(b))
}

/** 将 `priority` 中存在的列依次排到最前，其余列保持字母序在后 */
function applyColumnKeyPriority(keys: string[], priority?: readonly string[]): string[] {
  if (!priority?.length) return keys
  const keySet = new Set(keys)
  const head: string[] = []
  const seenHead = new Set<string>()
  for (const p of priority) {
    if (keySet.has(p) && !seenHead.has(p)) {
      seenHead.add(p)
      head.push(p)
    }
  }
  const headSet = new Set(head)
  const tail = keys.filter((k) => !headSet.has(k)).sort((a, b) => a.localeCompare(b))
  return [...head, ...tail]
}

const TABLE_TAG_PILL_PALETTE = [
  'border-emerald-500/35 bg-emerald-500/12 text-emerald-100',
  'border-sky-500/35 bg-sky-500/12 text-sky-100',
  'border-violet-500/35 bg-violet-500/12 text-violet-100',
  'border-amber-500/35 bg-amber-500/12 text-amber-100',
  'border-rose-500/35 bg-rose-500/12 text-rose-100',
  'border-cyan-500/35 bg-cyan-500/12 text-cyan-100',
] as const

function tableTagPillClass(label: string): string {
  const s = label.trim()
  if (!s || s === '—') return 'border-zinc-500/25 bg-zinc-500/10 text-zinc-400'
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return TABLE_TAG_PILL_PALETTE[Math.abs(h) % TABLE_TAG_PILL_PALETTE.length]!
}

function AdminEntityTableTagPill({ text }: { text: string }) {
  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium leading-snug ${tableTagPillClass(text)}`}
    >
      <span className="min-w-0 truncate">{text}</span>
    </span>
  )
}

function parseDraftValue(raw: string): unknown {
  const t = raw.trim()
  if (!t) return ''
  if (t === 'true') return true
  if (t === 'false') return false
  if (t === 'null') return null
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      return JSON.parse(t) as unknown
    } catch {
      return raw
    }
  }
  if (/^-?\d+$/.test(t)) return Number.parseInt(t, 10)
  if (/^-?\d+\.\d+$/.test(t)) return Number.parseFloat(t)
  return raw
}

function buildPayload(
  draft: Record<string, string>,
  keys: string[],
  verbatimStringKeys?: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) {
    if (k === 'id') continue
    if (verbatimStringKeys?.has(k)) {
      out[k] = String(draft[k] ?? '')
      continue
    }
    out[k] = parseDraftValue(draft[k] ?? '')
  }
  return out
}

type PagerProps = {
  page: number
  pageSize: number
  total: number
  pages: number
  loading: boolean
  onPageChange: (p: number) => void
}

function AdminEntityPager({ page, pageSize, total, pages, loading, onPageChange }: PagerProps) {
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

export type AdminEntityCrudApi = {
  list: (p: AdminPagedParams) => Promise<AdminPagedResult<AdminEntityRow>>
  get: (id: number) => Promise<AdminEntityRow>
  create: (body: Record<string, unknown>) => Promise<void>
  update: (id: number, body: Record<string, unknown>) => Promise<void>
  delete: (id: number) => Promise<void>
}

export type AdminEntityCellFormatter = (value: unknown, localeTag: string) => string

export type AdminEntityCrudPageProps = {
  api: AdminEntityCrudApi
  i18nPrefix: string
  /** 新增表单排除字段（服务端生成） */
  createOmitKeys?: readonly string[]
  /** 操作列是否横向滚动时固定在右侧（代理商页等可关闭） */
  stickyActionsColumn?: boolean
  /** 不在表格与创建/编辑表单中展示的字段（仍可由接口返回） */
  excludeColumnKeys?: readonly string[]
  /** 表格单元格展示覆盖（键为列名，与接口字段一致） */
  cellFormatters?: Readonly<Partial<Record<string, AdminEntityCellFormatter>>>
  /** 编辑弹窗不展示、保存时也不提交的字段（如只读时间戳；表格列仍可保留） */
  editFormOmitKeys?: readonly string[]
  /** 仅出现在「新增」弹窗的字段（如已从表格排除但仍要创建时提交），按数组顺序排在最前 */
  createAdditionalKeys?: readonly string[]
  /** 在「新增 / 编辑」弹窗中用数字输入框渲染的字段键（其余仍为多行文本框或下拉） */
  createNumberKeys?: readonly string[]
  /** 提交时保持字符串、不做数字/布尔解析（如说明类字段填纯数字） */
  verbatimStringKeys?: readonly string[]
  /** 新增弹窗标题下是否显示 `modalCreateHint` 说明文案 */
  showCreateModalHint?: boolean
  /** 新增与编辑提交前校验：这些键在草稿中均不能为空（trim 后） */
  requiredKeys?: readonly string[]
  /** 为 true 时，新增/编辑弹窗内展示的每个字段均必填（编辑时跳过 editFormOmitKeys） */
  requireAllFormFields?: boolean
  /** 表格列顺序：列出的字段（须存在于数据中）依次排在最前 */
  columnKeysPriority?: readonly string[]
  /** 表格中以彩色 Tag 展示的列（键与接口字段一致） */
  tagColumnKeys?: readonly string[]
  /** 仅从表格隐藏这些列（新增/编辑弹窗仍可出现并提交） */
  hideTableColumnKeys?: readonly string[]
  /** 新增/编辑弹窗中以下字段渲染为下拉框（键为 snake / camel，与接口一致） */
  formSelectOptions?: Readonly<Record<string, readonly string[]>>
  /**
   * 始终用多行文本框展示（固定高度、不可拖拽改大小），如套餐「说明」。
   * 键与接口字段一致；编辑弹窗中优先级高于「短文本用单行 input」的推断。
   */
  formTextareaKeys?: readonly string[]
  /** 这些数字字段不允许为负（输入框 min=0 + 提交校验） */
  nonNegativeNumberKeys?: readonly string[]
  /** 操作列在「编辑」与「删除」之间插入的额外控件（如套餐模型绑定） */
  renderRowActionsExtra?: (ctx: {
    row: AdminEntityRow
    actionsDisabled: boolean
  }) => ReactNode
}

export function AdminEntityCrudPage({
  api,
  i18nPrefix,
  createOmitKeys = DEFAULT_CREATE_OMIT,
  stickyActionsColumn = true,
  excludeColumnKeys = DEFAULT_EXCLUDE_COLUMN_KEYS,
  cellFormatters,
  editFormOmitKeys = [],
  createAdditionalKeys = [],
  createNumberKeys = [],
  verbatimStringKeys = [],
  showCreateModalHint = true,
  requiredKeys = [],
  requireAllFormFields = false,
  columnKeysPriority = [],
  tagColumnKeys = [],
  hideTableColumnKeys = [],
  formSelectOptions,
  formTextareaKeys = [],
  nonNegativeNumberKeys = [],
  renderRowActionsExtra,
}: AdminEntityCrudPageProps) {
  const { t, i18n } = useTranslation()
  const fieldLabel = useCallback(
    (key: string) => resolveFieldLabel(key, i18nPrefix, t, i18n),
    [i18n, i18nPrefix, t],
  )
  const thActionsClass = stickyActionsColumn ? `${th} ${thActionsSticky}` : `${th} text-right md:min-w-[11rem]`
  const tdActionsClass = stickyActionsColumn ? `${td} ${tdActionsSticky}` : `${td} text-right align-middle md:min-w-[11rem]`
  const localeTag = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'

  const formatTableCell = useCallback(
    (columnKey: string, v: unknown, tag: string) => {
      const fmt = cellFormatters?.[columnKey]
      if (fmt) return fmt(v, tag)
      return formatCell(v, tag)
    },
    [cellFormatters],
  )

  const [rows, setRows] = useState<AdminEntityRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)

  const [columnKeys, setColumnKeys] = useState<string[]>([])

  const [editId, setEditId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Record<string, string>>({})
  const [editDetailLoading, setEditDetailLoading] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const editFetchTokenRef = useRef(0)

  const [createOpen, setCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState<Record<string, string>>({})
  const [createBusy, setCreateBusy] = useState(false)

  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<AdminEntityRow | null>(null)

  const createOmit = useMemo(() => new Set<string>([...DEFAULT_CREATE_OMIT, ...createOmitKeys]), [createOmitKeys])
  const excludeKeySet = useMemo(() => new Set<string>(excludeColumnKeys), [excludeColumnKeys])
  const editFormOmitSet = useMemo(() => new Set<string>(editFormOmitKeys), [editFormOmitKeys])
  const createNumberKeySet = useMemo(() => new Set<string>(createNumberKeys), [createNumberKeys])
  const verbatimStringKeySet = useMemo(() => new Set<string>(verbatimStringKeys), [verbatimStringKeys])
  const tagColumnKeySet = useMemo(() => new Set<string>(tagColumnKeys), [tagColumnKeys])
  const hideTableColumnKeySet = useMemo(() => new Set<string>(hideTableColumnKeys), [hideTableColumnKeys])
  const nonNegativeNumberKeySet = useMemo(
    () => new Set<string>(nonNegativeNumberKeys),
    [nonNegativeNumberKeys],
  )
  const formTextareaKeySet = useMemo(() => new Set<string>(formTextareaKeys), [formTextareaKeys])
  const requiredKeySet = useMemo(() => new Set<string>(requiredKeys), [requiredKeys])

  const formTextareaClassName =
    'w-full resize-none overflow-y-auto rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 font-mono text-sm leading-relaxed text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50 h-32 min-h-32 max-h-32'

  const showRequiredFieldStar = useCallback(
    (fieldKey: string) => requireAllFormFields || requiredKeySet.has(fieldKey),
    [requireAllFormFields, requiredKeySet],
  )

  const displayColumnKeys = useMemo(
    () => applyColumnKeyPriority(columnKeys, columnKeysPriority),
    [columnKeys, columnKeysPriority],
  )

  const tableDisplayColumnKeys = useMemo(
    () => displayColumnKeys.filter((k) => !hideTableColumnKeySet.has(k)),
    [displayColumnKeys, hideTableColumnKeySet],
  )

  const tk = useCallback(
    (key: string, opt?: Record<string, string | number>) => t(`${i18nPrefix}.${key}`, opt),
    [i18nPrefix, t],
  )

  const loadRows = useCallback(async () => {
    setListLoading(true)
    try {
      const res = await api.list({ pageNum: currentPage, pageSize: PAGE_SIZE })
      setRows(res.rows)
      setTotal(res.total)
      setPages(Math.max(1, res.pages))
      setCurrentPage((prev) => Math.min(Math.max(1, prev), Math.max(1, res.pages)))
      setColumnKeys((prev) => {
        const inferred = inferColumnKeys(res.rows).filter((k) => !excludeKeySet.has(k))
        if (inferred.length > 0) return inferred
        return prev
      })
    } catch (e) {
      setRows([])
      setTotal(0)
      setPages(1)
      const msg =
        e instanceof NexusBizError ? e.message : e instanceof Error ? e.message : tk('loadFail')
      notify.error(msg || tk('loadFail'))
    } finally {
      setListLoading(false)
    }
  }, [api, currentPage, excludeKeySet, tk])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

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

  const openEdit = useCallback(
    (row: AdminEntityRow) => {
      const token = ++editFetchTokenRef.current
      setCreateOpen(false)
      setEditId(row.id)
      const d: Record<string, string> = {}
      for (const k of Object.keys(row)) {
        if (k === 'id' || excludeKeySet.has(k)) continue
        d[k] = stringifyValue(row[k])
      }
      setEditDraft(d)
      setEditDetailLoading(true)
      void (async () => {
        try {
          const detail = await api.get(row.id)
          if (token !== editFetchTokenRef.current) return
          const nd: Record<string, string> = {}
          for (const k of Object.keys(detail)) {
            if (k === 'id' || excludeKeySet.has(k)) continue
            nd[k] = stringifyValue(detail[k])
          }
          setEditDraft(nd)
          setColumnKeys((prev) => {
            const merged = new Set([...prev, ...Object.keys(nd)])
            merged.delete('id')
            for (const k of excludeKeySet) merged.delete(k)
            return [...merged].sort((a, b) => a.localeCompare(b))
          })
        } catch (e) {
          if (token !== editFetchTokenRef.current) return
          const msg = e instanceof NexusBizError ? e.message : e instanceof Error ? e.message : tk('loadFail')
          notify.error(msg || tk('loadFail'))
          setEditId(null)
          setEditDraft({})
        } finally {
          if (token === editFetchTokenRef.current) setEditDetailLoading(false)
        }
      })()
    },
    [api, excludeKeySet, tk],
  )

  const closeEdit = useCallback(() => {
    editFetchTokenRef.current += 1
    setEditId(null)
    setEditDraft({})
    setEditDetailLoading(false)
  }, [])

  const createKeys = useMemo(() => {
    const base = displayColumnKeys.filter((k) => !createOmit.has(k))
    const seen = new Set(base)
    const prepend: string[] = []
    for (const k of createAdditionalKeys) {
      if (seen.has(k)) continue
      seen.add(k)
      prepend.push(k)
    }
    return [...prepend, ...base]
  }, [displayColumnKeys, createOmit, createAdditionalKeys])

  const openCreate = useCallback(() => {
    editFetchTokenRef.current += 1
    setEditId(null)
    setEditDraft({})
    setEditDetailLoading(false)
    const d: Record<string, string> = {}
    for (const k of createKeys) d[k] = ''
    setCreateDraft(d)
    setCreateOpen(true)
  }, [createKeys])

  const closeCreate = useCallback(() => {
    setCreateOpen(false)
  }, [])

  const saveEdit = useCallback(async () => {
    if (editId == null) return
    if (requireAllFormFields) {
      for (const key of Object.keys(editDraft)) {
        if (editFormOmitSet.has(key)) continue
        const raw = editDraft[key]
        if (raw === undefined || String(raw).trim().length === 0) {
          notify.error(tk('fieldRequired', { field: fieldLabel(key) }))
          return
        }
      }
    } else if (requiredKeys.length > 0) {
      for (const key of requiredKeys) {
        const raw = editDraft[key]
        if (raw === undefined || String(raw).trim().length === 0) {
          notify.error(tk('fieldRequired', { field: fieldLabel(key) }))
          return
        }
      }
    }
    const negKey = firstNegativeNumericFieldKey(editDraft, nonNegativeNumberKeySet)
    if (negKey) {
      notify.error(t('admin.system.fieldNonNegative', { field: fieldLabel(negKey) }))
      return
    }
    const keys = Object.keys(editDraft).filter((k) => !editFormOmitSet.has(k))
    setSaveBusy(true)
    try {
      await api.update(editId, { id: editId, ...buildPayload(editDraft, keys, verbatimStringKeySet) })
      notify.success(tk('saveOk'))
      closeEdit()
      await loadRows()
    } catch (e) {
      const msg = e instanceof NexusBizError ? e.message : e instanceof Error ? e.message : tk('saveFail')
      notify.error(msg || tk('saveFail'))
    } finally {
      setSaveBusy(false)
    }
  }, [
    api,
    editId,
    editDraft,
    editFormOmitSet,
    closeEdit,
    loadRows,
    tk,
    verbatimStringKeySet,
    requiredKeys,
    requireAllFormFields,
    nonNegativeNumberKeySet,
    fieldLabel,
    t,
  ])

  const saveCreate = useCallback(async () => {
    const keys = Object.keys(createDraft)
    if (requireAllFormFields) {
      for (const key of createKeys) {
        const raw = createDraft[key]
        if (raw === undefined || String(raw).trim().length === 0) {
          notify.error(tk('fieldRequired', { field: fieldLabel(key) }))
          return
        }
      }
    } else if (requiredKeys.length > 0) {
      for (const key of requiredKeys) {
        const raw = createDraft[key]
        if (raw === undefined || String(raw).trim().length === 0) {
          notify.error(tk('fieldRequired', { field: fieldLabel(key) }))
          return
        }
      }
    } else {
      const anyFilled = keys.some((k) => String(createDraft[k] ?? '').trim().length > 0)
      if (!anyFilled) {
        notify.error(tk('createNeedField'))
        return
      }
    }
    const negKeyCreate = firstNegativeNumericFieldKey(createDraft, nonNegativeNumberKeySet)
    if (negKeyCreate) {
      notify.error(t('admin.system.fieldNonNegative', { field: fieldLabel(negKeyCreate) }))
      return
    }
    setCreateBusy(true)
    try {
      await api.create(buildPayload(createDraft, keys, verbatimStringKeySet))
      notify.success(tk('createOk'))
      closeCreate()
      await loadRows()
    } catch (e) {
      const msg = e instanceof NexusBizError ? e.message : e instanceof Error ? e.message : tk('createFail')
      notify.error(msg || tk('createFail'))
    } finally {
      setCreateBusy(false)
    }
  }, [
    api,
    createDraft,
    createKeys,
    closeCreate,
    loadRows,
    tk,
    verbatimStringKeySet,
    requiredKeys,
    requireAllFormFields,
    nonNegativeNumberKeySet,
    fieldLabel,
    t,
  ])

  const openDeleteConfirm = useCallback((row: AdminEntityRow) => {
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
      await api.delete(row.id)
      notify.success(tk('deleteOk'))
      setDeleteConfirmRow(null)
      if (editId === row.id) closeEdit()
      await loadRows()
    } catch (e) {
      const msg = e instanceof NexusBizError ? e.message : e instanceof Error ? e.message : tk('deleteFail')
      notify.error(msg || tk('deleteFail'))
    } finally {
      setDeletingId(null)
    }
  }, [api, deleteConfirmRow, editId, closeEdit, loadRows, tk])

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

  const deleteLabel = useMemo(() => {
    if (!deleteConfirmRow) return ''
    const firstCol = tableDisplayColumnKeys[0]
    if (firstCol) {
      const v = deleteConfirmRow[firstCol]
      if (v != null && String(v).trim()) return String(v)
    }
    return String(deleteConfirmRow.id)
  }, [deleteConfirmRow, tableDisplayColumnKeys])

  const minTableW = `${Math.max(48, tableDisplayColumnKeys.length * 10 + 14)}rem`

  return (
    <div className={`${pageWrap} flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden`}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-surface-850/90">
        <div className="flex shrink-0 items-center justify-end border-b border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <button
            type="button"
            disabled={listLoading || displayColumnKeys.length === 0}
            onClick={() => openCreate()}
            title={displayColumnKeys.length === 0 ? tk('addDisabledHint') : undefined}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" aria-hidden />
            {tk('add')}
          </button>
        </div>
        <div className="scrollbar-admin-table flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-scroll">
          <div className="flex min-h-0 min-w-[calc(100%+1px)] flex-1 flex-col items-start">
            {listLoading || rows.length === 0 ? (
              <div className="flex min-h-[min(20rem,calc(100vh-20rem))] w-full flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
                {listLoading ? (
                  <>
                    <span
                      className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300"
                      aria-hidden
                    />
                    <p className="text-sm text-zinc-500">{t('console.common.loading')}</p>
                  </>
                ) : (
                  <p className="text-sm text-zinc-500">{tk('empty')}</p>
                )}
              </div>
            ) : (
              <table
                className="w-max self-start border-separate border-spacing-0 text-left text-sm"
                style={{ minWidth: minTableW }}
              >
              <thead className="sticky top-0 z-[1]">
                <tr className="border-b border-white/[0.08] bg-surface-850/95 backdrop-blur-sm">
                  {tableDisplayColumnKeys.map((ck) => (
                    <th key={ck} className={th}>
                      {fieldLabel(ck)}
                    </th>
                  ))}
                  <th className={thActionsClass}>{tk('colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="last:border-0">
                    {tableDisplayColumnKeys.map((ck) => (
                      <td key={ck} className={`${td} max-w-[16rem]`}>
                        <button
                          type="button"
                          title={t('admin.system.clickToCopy')}
                          onClick={() => void copyTableCell(formatTableCell(ck, row[ck], localeTag))}
                          className="block w-full max-w-full cursor-pointer rounded px-0.5 text-left break-words text-zinc-200 transition hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
                        >
                          {tagColumnKeySet.has(ck) ? (
                            <AdminEntityTableTagPill text={formatTableCell(ck, row[ck], localeTag)} />
                          ) : (
                            formatTableCell(ck, row[ck], localeTag)
                          )}
                        </button>
                      </td>
                    ))}
                    <td className={tdActionsClass}>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          disabled={listLoading || deletingId != null || deleteConfirmRow != null}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-violet-200 transition hover:border-violet-400/35 hover:bg-violet-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <FontAwesomeIcon icon={faPenToSquare} className="h-3 w-3 opacity-80" aria-hidden />
                          {tk('edit')}
                        </button>
                        {renderRowActionsExtra
                          ? renderRowActionsExtra({
                              row,
                              actionsDisabled: listLoading || deletingId != null || deleteConfirmRow != null,
                            })
                          : null}
                        <button
                          type="button"
                          onClick={() => openDeleteConfirm(row)}
                          disabled={listLoading || deletingId != null || deleteConfirmRow != null}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/[0.08] px-2.5 py-1.5 text-xs font-medium text-rose-200 transition hover:border-rose-400/40 hover:bg-rose-500/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <FontAwesomeIcon icon={faTrash} className="h-3 w-3 opacity-80" aria-hidden />
                          {deletingId === row.id ? t('console.common.loading') : tk('delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-white/[0.08] bg-black/20 px-3 py-3 backdrop-blur-sm md:px-4">
          <AdminEntityPager
            page={currentPage}
            pageSize={PAGE_SIZE}
            total={total}
            pages={pages}
            loading={listLoading}
            onPageChange={(p) => setCurrentPage(p)}
          />
        </div>
      </div>

      {editId != null ? (
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
            className="flex max-h-[min(40rem,calc(100vh-4rem))] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-surface-900/95 shadow-panel ring-1 ring-black/40"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5">
              <h2 className="text-lg font-semibold text-white">{tk('modalEditTitle')}</h2>
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
                  {Object.keys(editDraft)
                    .filter((k) => !editFormOmitSet.has(k))
                    .sort((a, b) => a.localeCompare(b))
                    .map((k) => {
                      const selectOpts = getFormSelectOptions(k, formSelectOptions)
                      const raw = String(editDraft[k] ?? '')
                      const unknownVal = raw && selectOpts && !selectOpts.includes(raw) ? raw : null
                      return (
                        <div key={k}>
                          <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                            <span className="inline-flex flex-wrap items-baseline gap-0.5">
                              <span>{fieldLabel(k)}</span>
                              {showRequiredFieldStar(k) ? (
                                <span className="font-normal text-rose-400" aria-hidden>
                                  *
                                </span>
                              ) : null}
                            </span>
                          </label>
                          {selectOpts?.length ? (
                            <select
                              value={raw}
                              onChange={(e) => setEditDraft((d) => ({ ...d, [k]: e.target.value }))}
                              disabled={saveBusy}
                              className="w-full rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                            >
                              <option value="">{t('admin.system.formSelectPlaceholder')}</option>
                              {selectOpts.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                              {unknownVal ? (
                                <option value={unknownVal}>
                                  {unknownVal}
                                </option>
                              ) : null}
                            </select>
                          ) : createNumberKeySet.has(k) ? (
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min={nonNegativeNumberKeySet.has(k) ? 0 : undefined}
                              value={raw}
                              onChange={(e) => setEditDraft((d) => ({ ...d, [k]: e.target.value }))}
                              disabled={saveBusy}
                              className="w-full rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                            />
                          ) : formTextareaKeySet.has(k) ? (
                            <textarea
                              value={raw}
                              onChange={(e) => setEditDraft((d) => ({ ...d, [k]: e.target.value }))}
                              disabled={saveBusy}
                              className={formTextareaClassName}
                            />
                          ) : raw.length > 120 || raw.includes('\n') ? (
                            <textarea
                              rows={4}
                              value={raw}
                              onChange={(e) => setEditDraft((d) => ({ ...d, [k]: e.target.value }))}
                              disabled={saveBusy}
                              className="w-full resize-y rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                            />
                          ) : (
                            <input
                              type="text"
                              value={raw}
                              onChange={(e) => setEditDraft((d) => ({ ...d, [k]: e.target.value }))}
                              disabled={saveBusy}
                              className="w-full rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                            />
                          )}
                        </div>
                      )
                    })}
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
            className="flex max-h-[min(40rem,calc(100vh-4rem))] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-surface-900/95 shadow-panel ring-1 ring-black/40"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5">
              <div>
                <h2 className="text-lg font-semibold text-white">{tk('modalCreateTitle')}</h2>
                {showCreateModalHint ? (
                  <p className="mt-1 text-xs text-zinc-500">{tk('modalCreateHint')}</p>
                ) : null}
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
                {createKeys.map((k) => {
                  const selectOpts = getFormSelectOptions(k, formSelectOptions)
                  const raw = String(createDraft[k] ?? '')
                  return (
                    <div key={k}>
                      <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                        <span className="inline-flex flex-wrap items-baseline gap-0.5">
                          <span>{fieldLabel(k)}</span>
                          {showRequiredFieldStar(k) ? (
                            <span className="font-normal text-rose-400" aria-hidden>
                              *
                            </span>
                          ) : null}
                        </span>
                      </label>
                      {createNumberKeySet.has(k) ? (
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min={nonNegativeNumberKeySet.has(k) ? 0 : undefined}
                          value={raw}
                          onChange={(e) => setCreateDraft((d) => ({ ...d, [k]: e.target.value }))}
                          disabled={createBusy}
                          className="w-full rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                        />
                      ) : selectOpts?.length ? (
                        <select
                          value={raw}
                          onChange={(e) => setCreateDraft((d) => ({ ...d, [k]: e.target.value }))}
                          disabled={createBusy}
                          className="w-full rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                        >
                          <option value="">{t('admin.system.formSelectPlaceholder')}</option>
                          {selectOpts.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      ) : formTextareaKeySet.has(k) ? (
                        <textarea
                          value={raw}
                          onChange={(e) => setCreateDraft((d) => ({ ...d, [k]: e.target.value }))}
                          disabled={createBusy}
                          className={formTextareaClassName}
                        />
                      ) : (
                        <textarea
                          rows={2}
                          value={raw}
                          onChange={(e) => setCreateDraft((d) => ({ ...d, [k]: e.target.value }))}
                          disabled={createBusy}
                          className="w-full resize-y rounded-lg border border-white/[0.1] bg-surface-850/90 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none transition focus:border-accent/45 focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                        />
                      )}
                    </div>
                  )
                })}
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
            className="w-full max-w-sm rounded-2xl border border-white/[0.1] bg-surface-900/95 p-5 shadow-panel ring-1 ring-black/40"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-white">{tk('deleteModalTitle')}</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{tk('deleteConfirm', { label: deleteLabel })}</p>
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
