import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import type { AdminEntityRow } from '@/api/nexus/adminPagedResource'
import {
  addPackageModelBinding,
  extractBindingSetsFromPackageModelsPayload,
  getPackageBoundModelsRaw,
  listModelsServicesForBindingModal,
  pickModelNameForBindingApi,
  removePackageModelBinding,
  type PackageModelBindingState,
} from '@/api/nexus/packageModelBinding'
import { NexusBizError } from '@/api/errors'
import { notify } from '@/lib/toast'

const th = 'px-3 py-2 text-left text-xs font-medium tracking-wide text-zinc-500'
const td = 'border-t border-white/[0.06] px-3 py-2 text-xs text-zinc-200'

function formatDetailValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return '—'
    }
  }
  return String(v)
}

const STATUS_TAG_PALETTE_FALLBACK = [
  'border-violet-500/35 bg-violet-500/12 text-violet-100',
  'border-sky-500/35 bg-sky-500/12 text-sky-100',
  'border-cyan-500/35 bg-cyan-500/12 text-cyan-100',
  'border-amber-500/35 bg-amber-500/12 text-amber-100',
] as const

function statusTagPillClass(label: string): string {
  const s = label.trim().toLowerCase()
  if (!s || s === '—') return 'border-zinc-500/25 bg-zinc-500/10 text-zinc-400'
  if (s === 'healthy' || s === 'active' || s === 'ok' || s === 'running') {
    return 'border-emerald-500/35 bg-emerald-500/12 text-emerald-100'
  }
  if (s === 'unhealthy' || s === 'error' || s === 'down' || s === 'failed') {
    return 'border-rose-500/35 bg-rose-500/12 text-rose-100'
  }
  if (s === 'degraded' || s === 'warning' || s === 'pending') {
    return 'border-amber-500/35 bg-amber-500/12 text-amber-100'
  }
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return STATUS_TAG_PALETTE_FALLBACK[Math.abs(h) % STATUS_TAG_PALETTE_FALLBACK.length]!
}

function BindingStatusTag({ text }: { text: string }) {
  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium leading-snug ${statusTagPillClass(text)}`}
    >
      <span className="min-w-0 truncate">{text}</span>
    </span>
  )
}

/** 仅展示列（与接口字段名一致） */
const BINDING_TABLE_KEYS = ['id', 'name', 'status', 'description'] as const

function isRowBound(row: AdminEntityRow, binding: PackageModelBindingState): boolean {
  if (binding.isAllModels) return true
  const tryId = (v: unknown): boolean => {
    if (typeof v === 'number' && Number.isFinite(v) && binding.serviceIds.has(Math.trunc(v))) return true
    if (typeof v === 'string' && /^\d+$/.test(v.trim())) {
      return binding.serviceIds.has(Number.parseInt(v.trim(), 10))
    }
    return false
  }
  const tryName = (v: unknown): boolean =>
    typeof v === 'string' && binding.names.has(v.trim())

  if (tryId(row.id)) return true
  for (const k of ['service_id', 'serviceId'] as const) {
    if (tryId(row[k])) return true
  }
  for (const k of ['name', 'model_name', 'modelName'] as const) {
    if (tryName(row[k])) return true
  }
  return false
}

export type PackageModelBindingModalProps = {
  open: boolean
  packageId: number
  packageLabel: string
  onClose: () => void
}

export function PackageModelBindingModal({
  open,
  packageId,
  packageLabel,
  onClose,
}: PackageModelBindingModalProps) {
  const { t, i18n } = useTranslation()
  const tk = useCallback((key: string, opt?: Record<string, string | number>) => t(`admin.packageMgmt.${key}`, opt), [t])

  const bindingColumnLabel = useCallback(
    (fieldKey: string) => {
      const full = `admin.packageMgmt.modelBindingColumn.${fieldKey}`
      if (i18n.exists(full)) return t(full)
      return fieldKey.replace(/_/g, ' ')
    },
    [i18n, t],
  )

  const [rows, setRows] = useState<AdminEntityRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [binding, setBinding] = useState<PackageModelBindingState>({
    isAllModels: false,
    serviceIds: new Set(),
    names: new Set(),
  })

  const [confirmAction, setConfirmAction] = useState<null | { kind: 'bind' | 'unbind'; row: AdminEntityRow }>(null)
  const [actionBusy, setActionBusy] = useState(false)

  const refreshBinding = useCallback(async () => {
    try {
      const raw = await getPackageBoundModelsRaw(packageId)
      setBinding(extractBindingSetsFromPackageModelsPayload(raw))
    } catch (e) {
      const msg = e instanceof NexusBizError ? e.message : e instanceof Error ? e.message : tk('modelBindingLoadBoundFail')
      notify.error(msg || tk('modelBindingLoadBoundFail'))
      setBinding({ isAllModels: false, serviceIds: new Set(), names: new Set() })
    }
  }, [packageId, tk])

  useEffect(() => {
    if (!open) return
    void refreshBinding()
  }, [open, packageId, refreshBinding])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setListLoading(true)
    void (async () => {
      try {
        const res = await listModelsServicesForBindingModal()
        if (cancelled) return
        setRows(res.rows)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof NexusBizError ? e.message : e instanceof Error ? e.message : tk('modelBindingLoadListFail')
        notify.error(msg || tk('modelBindingLoadListFail'))
        setRows([])
      } finally {
        if (!cancelled) setListLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, packageId, tk])

  useEffect(() => {
    if (!open) {
      setConfirmAction(null)
      setActionBusy(false)
    }
  }, [open])

  const onRowActivate = useCallback(
    (row: AdminEntityRow) => {
      if (actionBusy || listLoading || binding.isAllModels) return
      const bound = isRowBound(row, binding)
      setConfirmAction({ kind: bound ? 'unbind' : 'bind', row })
    },
    [actionBusy, listLoading, binding],
  )

  const closeConfirm = useCallback(() => {
    if (actionBusy) return
    setConfirmAction(null)
  }, [actionBusy])

  const runConfirm = useCallback(async () => {
    if (!confirmAction) return
    const modelName = pickModelNameForBindingApi(confirmAction.row)
    if (!modelName) {
      notify.error(tk('modelBindingMissingModelName'))
      setConfirmAction(null)
      return
    }
    setActionBusy(true)
    try {
      if (confirmAction.kind === 'bind') {
        await addPackageModelBinding(packageId, modelName)
        notify.success(tk('modelBindingBindOk'))
      } else {
        await removePackageModelBinding(packageId, modelName)
        notify.success(tk('modelBindingUnbindOk'))
      }
      setConfirmAction(null)
      await refreshBinding()
    } catch (e) {
      const msg = e instanceof NexusBizError ? e.message : e instanceof Error ? e.message : ''
      const fallback =
        confirmAction.kind === 'bind' ? tk('modelBindingBindFail') : tk('modelBindingUnbindFail')
      notify.error(msg || fallback)
    } finally {
      setActionBusy(false)
    }
  }, [confirmAction, packageId, refreshBinding, tk])

  useEffect(() => {
    if (!open || confirmAction == null) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      closeConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, confirmAction, closeConfirm])

  if (!open) return null

  const confirmModelLabel = confirmAction ? pickModelNameForBindingApi(confirmAction.row) ?? '—' : ''

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/65 px-2 py-6 backdrop-blur-[2px] sm:px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="package-model-binding-title"
        className="flex max-h-[min(42rem,calc(100vh-3rem))] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-surface-900/95 shadow-panel ring-1 ring-black/40"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.08] px-4 pt-4 pb-3 md:px-5 md:pt-5">
          <div className="min-w-0">
            <h2 id="package-model-binding-title" className="text-lg font-semibold text-white">
              {tk('modelBindingModalTitle')}
            </h2>
            <p className="mt-1 truncate text-xs text-zinc-500" title={packageLabel}>
              {tk('modelBindingModalSubtitle', { label: packageLabel, id: packageId })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={(listLoading && rows.length === 0) || actionBusy}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-50"
            aria-label={t('admin.system.closeModal')}
          >
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </button>
        </div>

        <div className="scrollbar-surface min-h-0 flex-1 overflow-auto overscroll-y-contain">
          {listLoading && rows.length === 0 ? (
            <div className="flex min-h-[14rem] flex-col items-center justify-center gap-2 text-sm text-zinc-500">
              <span
                className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300"
                aria-hidden
              />
              {t('console.common.loading')}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-[10rem] items-center justify-center px-4 py-8 text-sm text-zinc-500">
              {tk('empty')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-[1] bg-surface-900/95 backdrop-blur-sm">
                  <tr className="border-b border-white/[0.08]">
                    {BINDING_TABLE_KEYS.map((ck) => (
                      <th
                        key={ck}
                        className={
                          ck === 'description'
                            ? `${th} min-w-[12rem] max-w-[28rem]`
                            : ck === 'name'
                              ? `${th} min-w-[8rem]`
                              : th
                        }
                      >
                        {bindingColumnLabel(ck)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const bound = isRowBound(row, binding)
                    const canActivateRow = !actionBusy && !listLoading && !binding.isAllModels
                    return (
                      <tr
                        key={row.id}
                        role={canActivateRow ? 'button' : undefined}
                        tabIndex={canActivateRow ? 0 : -1}
                        onClick={canActivateRow ? () => onRowActivate(row) : undefined}
                        onKeyDown={
                          canActivateRow
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  onRowActivate(row)
                                }
                              }
                            : undefined
                        }
                        title={
                          binding.isAllModels
                            ? tk('modelBindingRowHintAllModels')
                            : bound
                              ? tk('modelBindingRowHintUnbind')
                              : tk('modelBindingRowHintBind')
                        }
                        className={[
                          bound
                            ? 'bg-violet-500/[0.12] shadow-[inset_0_0_0_1px_rgba(167,139,250,0.25)]'
                            : '',
                          binding.isAllModels
                            ? 'cursor-default'
                            : actionBusy || listLoading
                              ? 'cursor-not-allowed opacity-60'
                              : bound
                                ? 'cursor-pointer transition-colors hover:bg-violet-500/[0.18]'
                                : 'cursor-pointer transition-colors hover:bg-white/[0.06]',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {BINDING_TABLE_KEYS.map((ck) => {
                          const raw = formatDetailValue(row[ck])
                          if (ck === 'status') {
                            return (
                              <td key={ck} className={`${td} align-middle`}>
                                <BindingStatusTag text={raw} />
                              </td>
                            )
                          }
                          if (ck === 'description') {
                            return (
                              <td
                                key={ck}
                                className={`${td} max-w-[28rem] min-w-[10rem] align-middle text-zinc-300`}
                                title={raw !== '—' ? raw : undefined}
                              >
                                <div className="truncate whitespace-nowrap">{raw}</div>
                              </td>
                            )
                          }
                          return (
                            <td
                              key={ck}
                              className={`${td} max-w-[14rem] truncate align-middle`}
                              title={raw !== '—' ? raw : undefined}
                            >
                              {raw}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {confirmAction ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeConfirm()
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="package-model-binding-confirm-title"
            className="w-full max-w-sm rounded-2xl border border-white/[0.1] bg-surface-900/95 p-5 shadow-panel ring-1 ring-black/40"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="package-model-binding-confirm-title" className="text-lg font-semibold text-white">
              {confirmAction.kind === 'bind' ? tk('modelBindingBindConfirmTitle') : tk('modelBindingUnbindConfirmTitle')}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              {confirmAction.kind === 'bind'
                ? tk('modelBindingBindConfirmBody', { name: confirmModelLabel })
                : tk('modelBindingUnbindConfirmBody', { name: confirmModelLabel })}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={actionBusy}
                className="rounded-lg border border-white/[0.1] px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('admin.system.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void runConfirm()}
                disabled={actionBusy}
                className={
                  confirmAction.kind === 'unbind'
                    ? 'rounded-lg border border-rose-500/35 bg-rose-500/15 px-4 py-2 text-sm font-medium text-rose-100 transition hover:border-rose-400/50 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50'
                    : 'rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50'
                }
              >
                {actionBusy ? t('console.common.loading') : tk('modelBindingConfirmButton')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
