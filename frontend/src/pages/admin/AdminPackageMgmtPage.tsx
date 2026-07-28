import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLink } from '@fortawesome/free-solid-svg-icons'
import type { AdminEntityRow } from '@/api/nexus/adminPagedResource'
import {
  createAdminPackageAdmin,
  deleteAdminPackageAdmin,
  getAdminPackageAdmin,
  listAdminPackagesAdmin,
  updateAdminPackageAdmin,
} from '@/api/nexus/adminPackagesAdmin'
import { AdminEntityCrudPage, type AdminEntityCellFormatter } from '@/pages/admin/AdminEntityCrudPage'
import { PackageModelBindingModal } from '@/pages/admin/PackageModelBindingModal'

const formatIsAllModelsCell: AdminEntityCellFormatter = (v, localeTag) => {
  if (v === true) return localeTag.startsWith('zh') ? '是' : 'Yes'
  if (v === false) return localeTag.startsWith('zh') ? '否' : 'No'
  return '—'
}

const PACKAGE_MGMT_CELL_FORMATTERS: Readonly<Partial<Record<string, AdminEntityCellFormatter>>> = {
  is_all_models: formatIsAllModelsCell,
  isAllModels: formatIsAllModelsCell,
}

/** 表格列顺序：名称置顶，其余与常见套餐字段展示习惯一致 */
const PACKAGE_MGMT_COLUMN_PRIORITY = [
  'name',
  'duration_days',
  'durationDays',
  'price',
  'rpm',
  'tpm',
  'package_type',
  'packageType',
  'is_all_models',
  'isAllModels',
  'package_code',
  'packageCode',
  'token_quota',
  'tokenQuota',
  'is_active',
  'isActive',
  'sort_order',
  'sortOrder',
  'price_cny',
  'priceCny',
  'created_at',
  'createdAt',
  'updated_at',
  'updatedAt',
] as const

/** 「名称」列用彩色 Tag 展示 */
const PACKAGE_MGMT_TAG_KEYS = ['name'] as const

/** 表格不展示（编辑/新增仍可填写） */
const PACKAGE_MGMT_HIDE_TABLE_KEYS = ['name_en', 'nameEn', 'description'] as const

/** 套餐类型：新增/编辑用下拉框 */
const PACKAGE_MGMT_FORM_SELECT_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  package_type: ['package', 'common'],
  is_all_models: ['true', 'false'],
}

/** 有效天数、价格、rpm、tpm：数字输入框 */
const PACKAGE_MGMT_NUMBER_KEYS = [
  'duration_days',
  'durationDays',
  'price',
  'rpm',
  'tpm',
] as const

/** 提交时保持字符串，避免纯数字被解析为 number（后端 Pydantic 要求 str） */
const PACKAGE_MGMT_VERBATIM_STRING_KEYS = [
  'name',
  'name_en',
  'nameEn',
  'description',
  'package_code',
  'packageCode',
] as const

const api = {
  list: listAdminPackagesAdmin,
  get: getAdminPackageAdmin,
  create: createAdminPackageAdmin,
  update: updateAdminPackageAdmin,
  delete: deleteAdminPackageAdmin,
}

export function AdminPackageMgmtPage() {
  const { t } = useTranslation()
  const [modelBindingTarget, setModelBindingTarget] = useState<{ id: number; label: string } | null>(null)

  const renderRowActionsExtra = useCallback(
    (ctx: { actionsDisabled: boolean; row: AdminEntityRow }) => (
      <button
        type="button"
        onClick={() =>
          setModelBindingTarget({
            id: ctx.row.id,
            label: String(ctx.row.name ?? ctx.row.id),
          })
        }
        disabled={ctx.actionsDisabled}
        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/25 bg-sky-500/[0.08] px-2.5 py-1.5 text-xs font-medium text-sky-200 transition hover:border-sky-400/40 hover:bg-sky-500/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <FontAwesomeIcon icon={faLink} className="h-3 w-3 opacity-80" aria-hidden />
        {t('admin.packageMgmt.modelBinding')}
      </button>
    ),
    [t],
  )

  return (
    <>
      <AdminEntityCrudPage
        i18nPrefix="admin.packageMgmt"
        api={api}
        stickyActionsColumn={false}
        showCreateModalHint={false}
        columnKeysPriority={PACKAGE_MGMT_COLUMN_PRIORITY}
        tagColumnKeys={PACKAGE_MGMT_TAG_KEYS}
        cellFormatters={PACKAGE_MGMT_CELL_FORMATTERS}
        hideTableColumnKeys={PACKAGE_MGMT_HIDE_TABLE_KEYS}
        formSelectOptions={PACKAGE_MGMT_FORM_SELECT_OPTIONS}
        formTextareaKeys={['description']}
        createNumberKeys={PACKAGE_MGMT_NUMBER_KEYS}
        nonNegativeNumberKeys={PACKAGE_MGMT_NUMBER_KEYS}
        verbatimStringKeys={PACKAGE_MGMT_VERBATIM_STRING_KEYS}
        renderRowActionsExtra={renderRowActionsExtra}
        requireAllFormFields
      />
      <PackageModelBindingModal
        open={modelBindingTarget != null}
        packageId={modelBindingTarget?.id ?? 0}
        packageLabel={modelBindingTarget?.label ?? ''}
        onClose={() => setModelBindingTarget(null)}
      />
    </>
  )
}
