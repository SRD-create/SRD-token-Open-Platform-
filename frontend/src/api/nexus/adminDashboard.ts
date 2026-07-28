import { http } from '@/api/http'
import { unpackDataResponse } from '@/api/response'
import { safeArray, safeRecord } from '@/lib/safe'

export type DashboardTopUser = {
  name: string
  tokenUsage: number
}

export type DashboardTopPackage = {
  name: string
  quantity: number
}

export type DashboardTopModel = {
  name: string
  usageCount: number
}

export type AdminDashboardData = {
  totalUsers: number
  totalAgents: number
  monthRevenue: number
  monthTokenUsage: number
  monthWithdraw: number
  totalModels: number
  yearMonthlyRevenue: number[]
  yearMonthlyTokens: number[]
  yearMonthlyWithdraw: number[]
  topTokenUsers: DashboardTopUser[]
  topPackages: DashboardTopPackage[]
  topModels: DashboardTopModel[]
  statYear: number
}

function pickNum(v: unknown, def = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim())
    if (Number.isFinite(n)) return n
  }
  return def
}

function pickStr(o: Record<string, unknown>, keys: readonly string[], fallback: string): string {
  for (const k of keys) {
    const v = o[k]
    if (v == null) continue
    const s = typeof v === 'string' ? v.trim() : String(v).trim()
    if (s) return s
  }
  return fallback
}

function parseMonthly12(v: unknown): number[] {
  const arr = safeArray<unknown>(v)
  const nums = arr.map((x) => pickNum(x, 0))
  if (nums.length >= 12) return nums.slice(0, 12)
  const out = [...nums]
  while (out.length < 12) out.push(0)
  return out.slice(0, 12)
}

/** 后端按 `{ month: 1..12, revenue|... }` 返回的年度序列 → 固定 12 个月 */
function fill12FromMonthKeyedSeries(v: unknown, valueKeys: readonly string[]): number[] {
  const arr = safeArray<unknown>(v)
  if (!arr.length) return parseMonthly12(v)
  const r0 = safeRecord(arr[0])
  if (!Object.keys(r0).length) return parseMonthly12(v)

  const month0 = Math.floor(pickNum(r0.month ?? r0.m, 0))
  const hasValue = valueKeys.some((k) => r0[k] != null)
  if (month0 < 1 || month0 > 12 || !hasValue) return parseMonthly12(v)

  const out = Array.from({ length: 12 }, () => 0)
  for (const it of arr) {
    const r = safeRecord(it)
    const month = Math.floor(pickNum(r.month ?? r.m, 0))
    if (month < 1 || month > 12) continue
    let val = 0
    for (const k of valueKeys) {
      if (r[k] != null) {
        val = pickNum(r[k])
        break
      }
    }
    out[month - 1] = val
  }
  return out
}

function parseTopUsers(v: unknown): DashboardTopUser[] {
  const arr = safeArray<unknown>(v)
  const out: DashboardTopUser[] = []
  for (const it of arr.slice(0, 10)) {
    const r = safeRecord(it)
    if (!Object.keys(r).length) continue
    out.push({
      name: pickStr(r, ['name', 'nickname', 'user_name', 'userName', 'username'], '—'),
      tokenUsage: pickNum(r.token_usage ?? r.tokenUsage ?? r.tokens ?? r.total_tokens ?? r.totalTokens),
    })
  }
  return out
}

function parseTopPackages(v: unknown): DashboardTopPackage[] {
  const arr = safeArray<unknown>(v)
  const out: DashboardTopPackage[] = []
  for (const it of arr.slice(0, 3)) {
    const r = safeRecord(it)
    if (!Object.keys(r).length) continue
    out.push({
      name: pickStr(r, ['name', 'title', 'package_name', 'packageName'], '—'),
      quantity: pickNum(
        r.purchase_count ??
          r.purchaseCount ??
          r.quantity ??
          r.count ??
          r.qty ??
          r.sales_count ??
          r.salesCount,
      ),
    })
  }
  return out
}

function parseTopModels(v: unknown): DashboardTopModel[] {
  const arr = safeArray<unknown>(v)
  const out: DashboardTopModel[] = []
  for (const it of arr.slice(0, 3)) {
    const r = safeRecord(it)
    if (!Object.keys(r).length) continue
    out.push({
      name: pickStr(r, ['name', 'model_name', 'modelName', 'title'], '—'),
      usageCount: pickNum(
        r.total_tokens ??
          r.totalTokens ??
          r.usage_count ??
          r.usageCount ??
          r.count ??
          r.requests ??
          r.calls,
      ),
    })
  }
  return out
}

function emptyDashboard(year: number): AdminDashboardData {
  const z = Array.from({ length: 12 }, () => 0)
  return {
    totalUsers: 0,
    totalAgents: 0,
    monthRevenue: 0,
    monthTokenUsage: 0,
    monthWithdraw: 0,
    totalModels: 0,
    yearMonthlyRevenue: z,
    yearMonthlyTokens: z,
    yearMonthlyWithdraw: z,
    topTokenUsers: [],
    topPackages: [],
    topModels: [],
    statYear: year,
  }
}

function parseDashboardInner(inner: unknown): AdminDashboardData {
  const y = new Date().getFullYear()
  if (inner == null) return emptyDashboard(y)

  if (typeof inner === 'string') {
    try {
      const parsed = JSON.parse(inner) as unknown
      return parseDashboardInner(parsed)
    } catch {
      return emptyDashboard(y)
    }
  }

  const o = safeRecord(inner)
  const statYear = Math.floor(
    pickNum(o.stat_year ?? o.statYear ?? o.year ?? o.dashboard_year, new Date().getFullYear()),
  )

  return {
    totalUsers: pickNum(o.total_users ?? o.totalUsers),
    totalAgents: pickNum(o.total_agents ?? o.totalAgents),
    monthRevenue: pickNum(
      o.monthly_revenue ??
        o.monthlyRevenue ??
        o.month_revenue ??
        o.monthRevenue ??
        o.month_recharge_package_revenue ??
        o.monthRechargePackageRevenue,
    ),
    monthTokenUsage: pickNum(
      o.monthly_token_usage ??
        o.monthlyTokenUsage ??
        o.month_token_usage ??
        o.monthTokenUsage ??
        o.month_tokens ??
        o.monthTokens,
    ),
    monthWithdraw: pickNum(
      o.monthly_withdrawal ??
        o.monthlyWithdrawal ??
        o.month_commission_withdraw ??
        o.monthCommissionWithdraw ??
        o.month_withdraw ??
        o.monthWithdraw,
    ),
    totalModels: pickNum(o.total_models ?? o.totalModels ?? o.model_count ?? o.modelCount),
    yearMonthlyRevenue: fill12FromMonthKeyedSeries(
      o.yearly_revenue_data ?? o.year_monthly_revenue ?? o.yearMonthlyRevenue ?? o.revenue_by_month,
      ['revenue', 'amount', 'value', 'total'],
    ),
    yearMonthlyTokens: fill12FromMonthKeyedSeries(
      o.yearly_token_usage_data ??
        o.year_monthly_token_usage ??
        o.yearMonthlyTokenUsage ??
        o.tokens_by_month,
      ['token_usage', 'tokenUsage', 'tokens', 'usage', 'amount', 'value'],
    ),
    yearMonthlyWithdraw: fill12FromMonthKeyedSeries(
      o.yearly_withdrawal_data ??
        o.year_monthly_commission_withdraw ??
        o.yearMonthlyCommissionWithdraw ??
        o.withdraw_by_month,
      ['withdrawal', 'withdraw', 'commission', 'amount', 'value'],
    ),
    topTokenUsers: parseTopUsers(o.top_token_users ?? o.topTokenUsers ?? o.token_usage_top_users),
    topPackages: parseTopPackages(
      o.top_packages ?? o.topPackages ?? o.top_packages_by_quantity ?? o.topPackagesByQuantity,
    ),
    topModels: parseTopModels(
      o.top_model_usage ?? o.topModelUsage ?? o.top_models_by_usage ?? o.topModelsByUsage ?? o.top_models,
    ),
    statYear: statYear > 2000 && statYear < 2100 ? statYear : y,
  }
}

/** GET /dashboard — 管理端仪表盘聚合数据 */
export async function fetchAdminDashboard(): Promise<AdminDashboardData> {
  const { data } = await http.get<unknown>('/dashboard')
  const inner = unpackDataResponse(data)
  return parseDashboardInner(inner)
}
