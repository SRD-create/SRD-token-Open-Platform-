import { safeArray, safeRecord, safeString } from '@/lib/safe'

function finiteNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** 账单/流水列表展示：去掉 ISO 的 `T`，并去掉末尾 `Z` 与毫秒小数 */
function formatApiDateTimeForDisplay(raw: string): string {
  const s = raw.trim()
  if (!s) return s
  return s.replace('T', ' ').replace(/\.\d{3,}Z?$/i, '').replace(/Z$/i, '').trim()
}

/** GET /account/balance 的 `data` */
export function pickAccountBalanceYuan(raw: unknown): number {
  const r = safeRecord(raw)
  return finiteNumber(r.balance ?? r.available_balance ?? r.amount ?? r.yuan ?? r.cny)
}

export function pickAccountCommissionYuan(raw: unknown): number {
  const r = safeRecord(raw)
  return finiteNumber(r.commission ?? r.reward_balance ?? r.agent_commission)
}

/** 仪表盘「当日已用 tokens」卡片；接口由 `total_tokens` 改为 `used_tokens_daily`，仍兼容旧字段 */
export function pickAccountUsedTokensDaily(raw: unknown): number {
  const r = safeRecord(raw)
  return finiteNumber(
    r.used_tokens_daily ?? r.usedTokensDaily ?? r.total_tokens ?? r.totalTokens,
  )
}

export function pickAccountUsedTokens(raw: unknown): number {
  const r = safeRecord(raw)
  return finiteNumber(r.used_tokens ?? r.usedTokens)
}

/** 用量行上的「计费金额」类字段（元）；无则返回 0 */
export function pickTokenUsageRowYuan(item: unknown): number {
  const r = safeRecord(item)
  return finiteNumber(
    r.cost ??
      r.amount ??
      r.total_cost ??
      r.price ??
      r.yuan ??
      r.billing_amount ??
      r.money ??
      r.fee,
  )
}

export function pickTokenUsageRowTokens(item: unknown): number {
  const r = safeRecord(item)
  const explicit = finiteNumber(r.total_tokens ?? r.tokens ?? r.token_count)
  if (explicit > 0) return explicit
  return finiteNumber(r.prompt_tokens) + finiteNumber(r.completion_tokens)
}

export function tokenUsageRowTimestamp(item: unknown): number {
  const r = safeRecord(item)
  const raw = safeString(
    r.created_at ?? r.createdAt ?? r.date ?? r.usage_date ?? r.timestamp ?? r.time,
  )
  if (!raw) return NaN
  const t = Date.parse(raw)
  return Number.isNaN(t) ? NaN : t
}

/** 将当月用量行按「日」聚合金额（元）；若行内无金额则用 tokens/1000 作占位高度 */
export function aggregateUsageByDayOfMonth(
  items: unknown[],
  year: number,
  month: number,
): { dailyYuan: number[]; usedTokenFallback: boolean } {
  const dim = new Date(year, month, 0).getDate()
  const yuanBuckets = Array.from({ length: dim }, () => 0)
  const tokBuckets = Array.from({ length: dim }, () => 0)
  let usedTokenFallback = false

  for (const it of items) {
    const t = tokenUsageRowTimestamp(it)
    if (Number.isNaN(t)) continue
    const d = new Date(t)
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue
    const dayIdx = d.getDate() - 1
    if (dayIdx < 0 || dayIdx >= dim) continue
    const y = pickTokenUsageRowYuan(it)
    if (y > 0) {
      yuanBuckets[dayIdx] += y
    } else {
      tokBuckets[dayIdx] += pickTokenUsageRowTokens(it)
      usedTokenFallback = true
    }
  }

  if (usedTokenFallback && yuanBuckets.every((v) => v === 0)) {
    return { dailyYuan: tokBuckets.map((t) => t / 1000), usedTokenFallback: true }
  }
  return { dailyYuan: yuanBuckets, usedTokenFallback: false }
}

/** 将当月用量行按「日」聚合每条记录上的 `total_tokens`（无则计 0） */
export function aggregateTotalTokensByDayOfMonth(
  items: unknown[],
  year: number,
  month: number,
): number[] {
  const dim = new Date(year, month, 0).getDate()
  const buckets = Array.from({ length: dim }, () => 0)

  for (const it of items) {
    const t = tokenUsageRowTimestamp(it)
    if (Number.isNaN(t)) continue
    const d = new Date(t)
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue
    const dayIdx = d.getDate() - 1
    if (dayIdx < 0 || dayIdx >= dim) continue
    const r = safeRecord(it)
    const tok = finiteNumber(r.total_tokens ?? r.totalTokens)
    buckets[dayIdx] += tok
  }
  return buckets
}

export function pickOrderRow(item: unknown): {
  /** 账单「订单编号」列：优先 `order_no`，否则回退数字 `id` */
  id: string
  status: string
  orderType: string
  paymentMethod: string
  transactionId: string
  amount: string
  createdAt: string
} {
  const r = safeRecord(item)
  const orderNo = safeString(r.order_no ?? r.orderNo ?? '').trim()
  const id = orderNo || safeString(r.id ?? r.order_id ?? r.orderId ?? '')
  const status = safeString(r.status ?? r.order_status ?? r.state ?? '—')
  const orderType = safeString(r.order_type ?? r.orderType ?? '').trim()
  const paymentMethod = safeString(r.payment_method ?? r.paymentMethod ?? '').trim()
  const transactionId = safeString(r.transaction_id ?? r.transactionId ?? '').trim()
  const amt = finiteNumber(r.amount ?? r.total_amount ?? r.price ?? r.money ?? r.yuan)
  const created = safeString(r.created_at ?? r.createdAt ?? r.created ?? '')
  return {
    id: id || '—',
    status,
    orderType: orderType || '—',
    paymentMethod: paymentMethod || '—',
    transactionId: transactionId || '—',
    amount: amt.toFixed(4),
    createdAt: created ? formatApiDateTimeForDisplay(created) : '—',
  }
}

/** 账单 / 邀请等金额展示：统一四位小数 */
export function formatMoneyishDisplay(raw: unknown): string {
  if (raw === null || raw === undefined) return '—'
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return '—'
    const n = Number(t)
    return Number.isFinite(n) ? n.toFixed(4) : t
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw.toFixed(4)
  const n = finiteNumber(raw)
  return Number.isFinite(n) ? n.toFixed(4) : '—'
}

/** 账户流水表格行（不暴露 `id` 列；`rowKey` 仅作列表 key） */
export function pickTransactionRow(item: unknown): {
  rowKey: string
  accountType: string
  type: string
  description: string
  amount: string
  balanceBefore: string
  balanceAfter: string
  createdAt: string
} {
  const r = safeRecord(item)
  const idRaw = r.id ?? r.transaction_id
  const rowKey =
    idRaw != null && String(idRaw).trim() !== ''
      ? String(idRaw)
      : `${safeString(r.created_at)}-${safeString(r.type)}-${safeString(r.amount)}`

  const accountType = safeString(r.account_type ?? r.accountType) || '—'
  const type = safeString(r.type ?? r.transaction_type) || '—'
  const description = safeString(r.description ?? r.desc ?? '').trim() || '—'
  const amount = formatMoneyishDisplay(r.amount ?? r.change ?? r.delta)
  const balanceBefore = formatMoneyishDisplay(r.balance_before ?? r.balanceBefore)
  const balanceAfter = formatMoneyishDisplay(r.balance_after ?? r.balanceAfter)
  const created = safeString(r.created_at ?? r.createdAt ?? '')
  return {
    rowKey,
    accountType,
    type,
    description,
    amount,
    balanceBefore,
    balanceAfter,
    createdAt: created ? formatApiDateTimeForDisplay(created) : '—',
  }
}

/**
 * 单条 `GET /packages/user` 行解析出的目录套餐 id（与 `GET /packages` 卡片 `id` 对齐）。
 * 规则与 {@link userOwnedPackageIds} 一致，供已购时间等字段按套餐 id 关联。
 */
export function userPackageRowCatalogIds(r: Record<string, unknown>): number[] {
  const p = r.package ?? r.packages

  if (Array.isArray(p) && p.length > 0) {
    const ids: number[] = []
    for (const el of p) {
      if (el === null || typeof el !== 'object' || Array.isArray(el)) continue
      const pr = safeRecord(el)
      const id = finiteNumber(pr.id ?? pr.package_id ?? pr.packageId)
      if (id > 0) ids.push(id)
    }
    return ids
  }

  if (p != null && typeof p === 'object' && !Array.isArray(p)) {
    const pr = safeRecord(p)
    const id = finiteNumber(pr.id ?? pr.package_id ?? pr.packageId)
    if (id > 0) return [id]
  }

  const flat = finiteNumber(r.package_id ?? r.packageId)
  if (flat > 0) return [flat]

  if (!('package' in r) && !('packages' in r)) {
    const id = finiteNumber(r.id)
    if (id > 0) return [id]
  }
  return []
}

/**
 * 用户已购列表中的目录套餐 id（与 GET /packages 卡片 `id` 对齐）。
 * 优先 `data[].package`：非空数组则收集每项的 `id`（支持多个已购）；单对象则取其 `id`。
 * 仅当本条无可用 `package` 时，才回退根级 `package_id` / `packageId`；再否则在无 `package` 键时用根 `id`（兼容旧接口）。
 */
export function userOwnedPackageIds(items: unknown[]): Set<number> {
  const s = new Set<number>()
  for (const it of items) {
    for (const id of userPackageRowCatalogIds(safeRecord(it))) {
      if (id > 0) s.add(id)
    }
  }
  return s
}

/** 已购套餐的起止时间（与目录套餐 id 对齐）；同一 id 保留首次出现的记录 */
export function userOwnedPackagePeriodsByCatalogId(
  items: unknown[],
): Map<number, { startAt: string; endAt: string }> {
  const map = new Map<number, { startAt: string; endAt: string }>()
  for (const it of items) {
    const r = safeRecord(it)
    const ids = userPackageRowCatalogIds(r)
    if (ids.length === 0) continue
    const startRaw = safeString(r.start_at ?? r.startAt ?? '')
    const endRaw = safeString(r.end_at ?? r.endAt ?? '')
    const startAt = startRaw ? formatApiDateTimeForDisplay(startRaw) : '—'
    const endAt = endRaw ? formatApiDateTimeForDisplay(endRaw) : '—'
    const meta = { startAt, endAt }
    for (const id of ids) {
      if (!map.has(id)) map.set(id, meta)
    }
  }
  return map
}

/** 与后端 `package_type` 对齐：`common` 计量类，`package` 套餐类 */
export function pickPackageType(item: unknown): 'common' | 'package' {
  const r = safeRecord(item)
  const raw = safeString(r.package_type ?? r.packageType ?? '').toLowerCase()
  if (raw === 'common') return 'common'
  if (raw === 'package') return 'package'
  return 'package'
}

function parseIsAllModelsFlag(r: Record<string, unknown>): boolean {
  const v = r.is_all_models ?? r.isAllModels ?? r.is_all_model
  if (v === true || v === 1 || v === '1' || v === 'true') return true
  return false
}

/** 套餐列表项里 `models` 数组：元素可为字符串、数字或含 model_name / name 的对象 */
function collectPackageModelDisplayLabel(it: unknown): string | null {
  if (typeof it === 'string') {
    const s = it.trim()
    return s || null
  }
  if (typeof it === 'number' && Number.isFinite(it)) return String(Math.trunc(it))
  const o = safeRecord(it)
  for (const k of ['model_name', 'modelName', 'name', 'title'] as const) {
    const s = safeString(o[k]).trim()
    if (s) return s
  }
  return null
}

export function pickPackageModelsMeta(item: unknown): {
  isAllModels: boolean
  modelLabels: string[]
} {
  const r = safeRecord(item)
  const isAllModels = parseIsAllModelsFlag(r)
  const raw = r.models
  const labels: string[] = []
  if (!isAllModels && Array.isArray(raw)) {
    for (const it of raw) {
      const lab = collectPackageModelDisplayLabel(it)
      if (lab) labels.push(lab)
    }
  }
  return { isAllModels, modelLabels: labels }
}

export function pickPackageRow(item: unknown): {
  id: number
  name: string
  priceLabel: string
  priceYuan: number
  /** 目录套餐有效天数；无或非正数时为 0 */
  durationDays: number
  desc: string
  packageType: 'common' | 'package'
  isAllModels: boolean
  modelLabels: string[]
} {
  const r = safeRecord(item)
  const id = finiteNumber(r.id ?? r.package_id ?? r.packageId)
  const name = safeString(r.name ?? r.title ?? r.package_name ?? `套餐 #${id}`)
  const price = finiteNumber(r.price ?? r.amount ?? r.cny ?? 0)
  const durationDays = Math.max(
    0,
    Math.trunc(finiteNumber(r.duration_days ?? r.durationDays ?? 0)),
  )
  const credits = finiteNumber(r.credits ?? r.quota ?? r.tokens ?? 0)
  const desc =
    safeString(r.description ?? r.desc ?? '') ||
    (credits > 0 ? `${credits} credits` : safeString(r.summary ?? ''))
  const priceLabel =
    price > 0
      ? new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(price)
      : '—'
  const { isAllModels, modelLabels } = pickPackageModelsMeta(item)
  return {
    id: id || 0,
    name: name || '—',
    priceLabel,
    priceYuan: price,
    durationDays,
    desc,
    packageType: pickPackageType(item),
    isAllModels,
    modelLabels,
  }
}

function firstPositiveIntFromUnknown(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.trunc(v)
  const s = safeString(v).trim()
  if (!s) return null
  const digits = s.match(/\d+/g)
  if (!digits) return null
  for (const chunk of digits) {
    const n = Number.parseInt(chunk, 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

/** 从充值/购套餐等「拉起 Native 支付」返回体中尽量解析出订单 ID（用于轮询 `GET /orders/{id}`） */
export function pickPaymentFlowOrderId(raw: unknown): number | null {
  const r = safeRecord(raw)
  const nestedData = safeRecord(r.data)
  const nestedOrder = safeRecord(nestedData.order)
  const order = safeRecord(r.order)
  const candidates = [
    r.order_id,
    r.orderId,
    r.id,
    order.order_id,
    order.orderId,
    order.id,
    nestedData.order_id,
    nestedData.orderId,
    nestedOrder.order_id,
    nestedOrder.orderId,
    nestedOrder.id,
  ]
  for (const c of candidates) {
    const n = firstPositiveIntFromUnknown(c)
    if (n) return n
  }
  return null
}

/** @deprecated 使用 {@link pickPaymentFlowOrderId} */
export function pickTopUpOrderId(raw: unknown): number | null {
  return pickPaymentFlowOrderId(raw)
}

export function pickNativePayQrUrl(raw: unknown): string | null {
  const r = safeRecord(raw)
  const order = safeRecord(r.order)
  const nestedData = safeRecord(r.data)
  const nestedOrder = safeRecord(nestedData?.order)
  const u = safeString(
    r.code_url ??
      r.qr_url ??
      r.qrCodeUrl ??
      r.url ??
      r.pay_url ??
      r.payment_url ??
      r.mweb_url ??
      order?.code_url ??
      order?.qr_url ??
      order?.qrCodeUrl ??
      order?.url ??
      nestedData?.code_url ??
      nestedData?.qr_url ??
      nestedOrder?.code_url ??
      nestedOrder?.qr_url,
  ).trim()
  return /^(https?:\/\/|weixin:\/\/|wxp:\/\/)/i.test(u) ? u : null
}

export function pickSummaryTotalTokens(raw: unknown): number | null {
  const r = safeRecord(raw)
  const v = r.total_tokens ?? r.tokens ?? r.totalTokens
  const n = finiteNumber(v)
  return n > 0 ? n : null
}

export function pickSummaryTotalSpendYuan(raw: unknown): number | null {
  const r = safeRecord(raw)
  const v = r.total_spend ?? r.total_cost ?? r.total_amount ?? r.spend_yuan
  const n = finiteNumber(v)
  return n > 0 ? n : null
}

export function safeChatAssistantContent(data: unknown): string | null {
  const r = safeRecord(data)
  const choices = safeArray<unknown>(r.choices)
  const c0 = safeRecord(choices[0])
  const msg = safeRecord(c0.message)
  const content = safeString(msg.content)
  return content || null
}

/** OpenAI 兼容 chat/completions 的 `usage` 块 */
export type ChatCompletionUsagePayload = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/** 自非流式完整 JSON 或单条 SSE 解析对象上取 `usage` */
export function pickChatCompletionUsage(data: unknown): ChatCompletionUsagePayload | null {
  const r = safeRecord(data)
  const u = r.usage
  if (u == null || typeof u !== 'object' || Array.isArray(u)) return null
  const ur = u as Record<string, unknown>
  const pt = ur.prompt_tokens ?? ur.promptTokens
  const ct = ur.completion_tokens ?? ur.completionTokens
  const tt = ur.total_tokens ?? ur.totalTokens
  if (pt == null && ct == null && tt == null) return null
  return {
    promptTokens: finiteNumber(pt),
    completionTokens: finiteNumber(ct),
    totalTokens: finiteNumber(tt),
  }
}

/**
 * 流式 SSE：网关常在**倒数第二条** `data:` JSON 上带 `usage`（末条可能为空或 [DONE]）。
 * 优先取倒数第二条；若无 `usage` 再自后往前扫。
 */
export function pickChatCompletionUsageFromStreamSsePayloads(
  payloads: unknown[],
): ChatCompletionUsagePayload | null {
  if (payloads.length >= 2) {
    const u = pickChatCompletionUsage(payloads[payloads.length - 2]!)
    if (u) return u
  }
  for (let i = payloads.length - 1; i >= 0; i--) {
    const u = pickChatCompletionUsage(payloads[i]!)
    if (u) return u
  }
  return null
}
