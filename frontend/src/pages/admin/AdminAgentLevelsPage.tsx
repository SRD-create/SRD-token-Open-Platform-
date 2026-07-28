import { useMemo } from 'react'
import { commissionRateToPercent } from '@/api/mappers/agentPackage'
import {
  createAdminAgentLevel,
  deleteAdminAgentLevel,
  getAdminAgentLevel,
  listAdminAgentLevels,
  updateAdminAgentLevel,
} from '@/api/nexus/adminAgentLevels'
import { AdminEntityCrudPage, type AdminEntityCellFormatter } from '@/pages/admin/AdminEntityCrudPage'

const AGENT_LEVEL_EXCLUDE_COLUMNS = ['updated_at', 'updatedAt'] as const

/** 与接口字段一致；新增/编辑均须填写 */
const AGENT_LEVEL_REQUIRED_KEYS = [
  'level',
  'commission_rate',
  'description',
  'description_en',
  'price',
] as const
const AGENT_LEVEL_EDIT_FORM_OMIT = ['created_at', 'createdAt'] as const

/** 表格列顺序：说明 → 档位 → 佣金 → 创建时间 → 英文说明 → 价格（其余字段字母序在后） */
const AGENT_LEVEL_COLUMN_PRIORITY = [
  'description',
  'level',
  'commission_rate',
  'commissionRate',
  'created_at',
  'createdAt',
  'description_en',
  'descriptionEn',
  'price',
] as const
/** 「说明」列用彩色 Tag 展示 */
const AGENT_LEVEL_TAG_KEYS = ['description'] as const

/** 新增弹窗里用数字框的字段（兼容 snake / camel） */
const AGENT_LEVEL_CREATE_NUMBER_KEYS = [
  'level',
  'commission_rate',
  'commissionRate',
  'price',
  'price_cny',
  'priceCny',
] as const

const api = {
  list: listAdminAgentLevels,
  get: getAdminAgentLevel,
  create: createAdminAgentLevel,
  update: updateAdminAgentLevel,
  delete: deleteAdminAgentLevel,
}

function formatCommissionRateCell(v: unknown, localeTag: string): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string' && !v.trim()) return '—'
  const pct = commissionRateToPercent(v)
  return `${new Intl.NumberFormat(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(pct)}%`
}

export function AdminAgentLevelsPage() {
  const cellFormatters = useMemo(() => {
    const f: AdminEntityCellFormatter = formatCommissionRateCell
    return { commission_rate: f, commissionRate: f } as const
  }, [])

  return (
    <AdminEntityCrudPage
      i18nPrefix="admin.agentLevels"
      api={api}
      showCreateModalHint={false}
      stickyActionsColumn={false}
      excludeColumnKeys={AGENT_LEVEL_EXCLUDE_COLUMNS}
      editFormOmitKeys={AGENT_LEVEL_EDIT_FORM_OMIT}
      cellFormatters={cellFormatters}
      createAdditionalKeys={['level', 'description_en', 'price']}
      createNumberKeys={AGENT_LEVEL_CREATE_NUMBER_KEYS}
      verbatimStringKeys={['description', 'description_en']}
      requiredKeys={AGENT_LEVEL_REQUIRED_KEYS}
      columnKeysPriority={AGENT_LEVEL_COLUMN_PRIORITY}
      tagColumnKeys={AGENT_LEVEL_TAG_KEYS}
    />
  )
}
