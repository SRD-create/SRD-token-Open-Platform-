import { safeRecord, safeString } from '@/lib/safe'

function finiteNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatApiDateTimeForDisplay(raw: string): string {
  const s = raw.trim()
  if (!s) return s
  return s.replace('T', ' ').replace(/\.\d{3,}Z?$/i, '').replace(/Z$/i, '').trim()
}

/** 创建提现等接口 `data` 中的主键（与列表字段对齐） */
export function pickWithdrawalIdFromPayload(payload: unknown): number | null {
  const r = safeRecord(payload)
  if (!r) return null
  const idRaw = r.id ?? r.withdrawal_id ?? r.withdrawalId
  const id = typeof idRaw === 'number' ? idRaw : Number(idRaw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

/** GET /withdrawals 列表单行 → 表格展示 */
export function pickWithdrawalTableRow(item: unknown): {
  id: number
  amountYuan: number
  /** 接口 `bank_account`；空串表示未填，由页面展示默认文案 */
  bankAccount: string
  statusRaw: string
  outBatchNo: string
  transferBillNo: string
  failureReason: string
  createdAt: string
} | null {
  const r = safeRecord(item)
  const id = pickWithdrawalIdFromPayload(item)
  if (id == null) return null
  const amount = finiteNumber(r.amount ?? r.yuan ?? r.money ?? r.total)
  const bankAccount = safeString(r.bank_account ?? r.bankAccount).trim()
  const statusRaw = safeString(r.status ?? r.state ?? '').trim() || '—'
  const outBatchNo = safeString(r.out_batch_no ?? r.outBatchNo).trim()
  const transferBillNo = safeString(r.transfer_bill_no ?? r.transferBillNo).trim()
  const failureReason = safeString(r.failure_reason ?? r.failureReason).trim()
  const created = safeString(r.created_at ?? r.createdAt ?? r.created ?? '')
  const createdAt = created ? formatApiDateTimeForDisplay(created) : '—'
  return { id, amountYuan: amount, bankAccount, statusRaw, outBatchNo, transferBillNo, failureReason, createdAt }
}

/** GET /withdrawals/{id} 详情 → 弹窗展示用（原始字段保留由页面做文案与货币格式化） */
export function parseWithdrawalDetailPayload(detail: unknown): {
  id: number | null
  amountYuan: number
  bankAccount: string
  statusRaw: string
  /** 转出批次号 */
  outBatchNo: string
  /** 转账流水号 */
  transferBillNo: string
  /** 失败原因；成功或无失败时为空串 */
  failureReason: string
  /** 微信确认收款 package，无则为空串 */
  packageInfo: string
  createdRaw: string
  updatedRaw: string
} | null {
  if (detail == null || typeof detail !== 'object' || Array.isArray(detail)) return null
  const r = safeRecord(detail)
  const id = pickWithdrawalIdFromPayload(detail)
  const amountYuan = finiteNumber(r.amount ?? r.yuan ?? r.money ?? r.total)
  const bankAccount = safeString(r.bank_account ?? r.bankAccount).trim()
  const statusRaw = safeString(r.status ?? r.state ?? '').trim() || '—'
  const outBatchNo = safeString(r.out_batch_no ?? r.outBatchNo).trim()
  const transferBillNo = safeString(r.transfer_bill_no ?? r.transferBillNo).trim()
  const failureReason = safeString(r.failure_reason ?? r.failureReason).trim()
  const pkgRaw = r.package_info ?? r.packageInfo
  const packageInfo =
    typeof pkgRaw === 'string' && pkgRaw.trim().length > 0 ? pkgRaw.trim() : ''
  const createdRaw = safeString(r.created_at ?? r.createdAt ?? '')
  const updatedRaw = safeString(r.updated_at ?? r.updatedAt ?? '')
  return {
    id,
    amountYuan,
    bankAccount,
    statusRaw,
    outBatchNo,
    transferBillNo,
    failureReason,
    packageInfo,
    createdRaw,
    updatedRaw,
  }
}
