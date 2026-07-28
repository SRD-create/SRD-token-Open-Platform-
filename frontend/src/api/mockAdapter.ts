import { AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { currentAcceptLanguage } from '@/api/acceptLanguage'
import { resolveHttpBaseUrl } from '@/api/apiOrigin'
import { AITOKEN_DEMO_TOKEN_LS_KEY } from '@/api/sessionExpired401'

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function pathFromConfig(config: InternalAxiosRequestConfig): string {
  const u = config.url ?? ''
  if (u.startsWith('http')) {
    try {
      return new URL(u).pathname.replace(/\/+/g, '/') || '/'
    } catch {
      return u
    }
  }
  const base = (config.baseURL ?? '').replace(/\/$/, '')
  const p = u.startsWith('/') ? u : `/${u}`
  return `${base}${p}`.replace(/\/+/g, '/') || '/'
}

function okData<T>(data: T) {
  return { code: 200, message: '操作成功', data }
}

function okList(items: unknown[], total?: number) {
  return { code: 200, message: '操作成功', data: items, total: total ?? items.length }
}

function limitOffsetFromConfig(config?: InternalAxiosRequestConfig): { limit: number; offset: number } {
  const p = (config?.params ?? {}) as Record<string, unknown>
  const limitRaw = Number(p.limit)
  const offsetRaw = Number(p.offset)
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : 10
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0
  return { limit, offset }
}

function okPaginatedList<T>(all: readonly T[], limit: number, offset: number) {
  return okList(all.slice(offset, offset + limit), all.length)
}

/**
 * `GET /agents/levels` 不在 Mock 中造业务数据，始终请求真实后端（与 OpenAPI 一致），
 * 避免前端写死 `price` / `commission_rate` / `description` 等与线上漂移。
 * 仍走 `http` 实例发出的请求，故会经过请求拦截器；此处用 `fetch` 仅绕过 mock adapter。
 */
async function forwardAgentsLevelsToBackend(
  config: InternalAxiosRequestConfig,
): Promise<AxiosResponse> {
  const base = (config.baseURL ?? resolveHttpBaseUrl()).replace(/\/$/, '')
  const rel = (config.url ?? '').startsWith('/') ? (config.url ?? '') : `/${config.url ?? ''}`
  const pathJoined = `${base}${rel}`.replace(/\/+/g, '/')
  const url =
    pathJoined.startsWith('http://') || pathJoined.startsWith('https://')
      ? pathJoined
      : `${typeof window !== 'undefined' ? window.location.origin : ''}${pathJoined.startsWith('/') ? pathJoined : `/${pathJoined}`}`

  const headers = new Headers()
  headers.set('Accept', 'application/json')
  headers.set('Accept-Language', currentAcceptLanguage())
  const token = localStorage.getItem(AITOKEN_DEMO_TOKEN_LS_KEY)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(url, {
    method: 'GET',
    headers,
    ...(config.signal ? { signal: config.signal as AbortSignal } : {}),
  })
  let data: unknown
  try {
    data = await res.json()
  } catch {
    data = null
  }

  const response: AxiosResponse = {
    data,
    status: res.status,
    statusText: res.statusText,
    headers: new AxiosHeaders(Object.fromEntries(res.headers.entries())),
    config,
  }
  return response
}

/** 充值/购套餐创建的订单 id，用于 `GET /orders/{id}` 单次查询返回已支付（本地 mock） */
const mockPaymentOrderIds = new Set<number>()
let mockOrderSeq = 2000

function nextMockOrderId() {
  mockOrderSeq += 1
  return mockOrderSeq
}

function mockParseJsonBody(config?: InternalAxiosRequestConfig): Record<string, unknown> {
  const raw = config?.data
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  return {}
}

type MockSystemConfigRecord = {
  id: number
  config_key: string
  config_value: string
  description: string
  category: string
  is_deleted: boolean
  created_at: string
  updated_at: string
}

/** `GET/POST /config/system*` — Mock 与线上一致的 `records` 结构 */
let mockSystemConfigRecords: MockSystemConfigRecord[] = [
  {
    id: 21,
    config_key: 'topup_min',
    config_value: '0.1',
    description: '充值最小值',
    category: 'business',
    is_deleted: false,
    created_at: '2024-04-21T09:50:14',
    updated_at: '2024-04-21T14:06:25',
  },
  {
    id: 22,
    config_key: 'withdraw_max',
    config_value: '50000',
    description: '提取金额最大值',
    category: 'business',
    is_deleted: false,
    created_at: '2024-04-21T09:51:00',
    updated_at: '2024-04-22T10:00:00',
  },
  {
    id: 23,
    config_key: 'api_server_url',
    config_value: 'https://api.example.com/v1',
    description: 'API调用服务地址',
    category: 'business',
    is_deleted: false,
    created_at: '2024-04-21T10:00:00',
    updated_at: '2024-04-21T10:00:00',
  },
  {
    id: 24,
    config_key: 'kafka_bootstrap',
    config_value: 'kafka.internal:9092',
    description: 'Kafka 服务器地址',
    category: 'infra',
    is_deleted: false,
    created_at: '2024-04-21T11:00:00',
    updated_at: '2024-04-21T11:00:00',
  },
  {
    id: 25,
    config_key: 'litellm_master_key',
    config_value: 'sk-mock-xxxx',
    description: 'LiteLLM Master Key',
    category: 'security',
    is_deleted: false,
    created_at: '2024-04-21T12:00:00',
    updated_at: '2024-04-21T12:00:00',
  },
  {
    id: 26,
    config_key: 'agent_tier_1_price',
    config_value: '1999',
    description: '代理加盟 · 创业启航版',
    category: 'agent',
    is_deleted: false,
    created_at: '2024-04-22T09:00:00',
    updated_at: '2024-04-22T09:00:00',
  },
  {
    id: 27,
    config_key: 'package_starter',
    config_value: '50',
    description: '购买套餐 · 入门包',
    category: 'package',
    is_deleted: false,
    created_at: '2024-04-22T10:00:00',
    updated_at: '2024-04-22T10:00:00',
  },
  {
    id: 28,
    config_key: 'rate_limit_rpm',
    config_value: '120',
    description: '每分钟请求上限',
    category: 'business',
    is_deleted: false,
    created_at: '2024-04-23T09:00:00',
    updated_at: '2024-04-23T09:00:00',
  },
  {
    id: 29,
    config_key: 'maintenance_mode',
    config_value: 'false',
    description: '维护模式开关',
    category: 'business',
    is_deleted: false,
    created_at: '2024-04-23T10:00:00',
    updated_at: '2024-04-23T10:00:00',
  },
  {
    id: 30,
    config_key: 'session_ttl_hours',
    config_value: '72',
    description: '会话有效期（小时）',
    category: 'security',
    is_deleted: false,
    created_at: '2024-04-24T09:00:00',
    updated_at: '2024-04-24T09:00:00',
  },
  {
    id: 31,
    config_key: 'smtp_host',
    config_value: 'smtp.example.com',
    description: '邮件 SMTP 主机',
    category: 'infra',
    is_deleted: false,
    created_at: '2024-04-24T10:00:00',
    updated_at: '2024-04-24T10:00:00',
  },
  {
    id: 32,
    config_key: 'deprecated_flag',
    config_value: '0',
    description: '已下线占位项',
    category: 'business',
    is_deleted: true,
    created_at: '2024-04-20T08:00:00',
    updated_at: '2024-04-25T08:00:00',
  },
  {
    id: 33,
    config_key: 'cdn_base_url',
    config_value: 'https://cdn.example.com',
    description: '静态资源 CDN 根地址',
    category: 'infra',
    is_deleted: false,
    created_at: '2024-04-25T09:00:00',
    updated_at: '2024-04-25T09:00:00',
  },
]

/** 管理端 `GET /admin/agent-levels` 等 — 本地假数据 */
let mockAdminAgentLevels: Array<Record<string, unknown>> = [
  {
    id: 1,
    level_code: 'L1',
    level_name: '总代',
    commission_rate: 0.18,
    sort_order: 1,
    description: '一级代理',
    created_at: '2026-01-01T08:00:00',
    updated_at: '2026-01-15T10:00:00',
  },
  {
    id: 2,
    level_code: 'L2',
    level_name: '区域代理',
    commission_rate: 0.12,
    sort_order: 2,
    description: '二级',
    created_at: '2026-01-02T08:00:00',
    updated_at: '2026-01-10T09:00:00',
  },
  {
    id: 3,
    level_code: 'L3',
    level_name: '渠道伙伴',
    commission_rate: 0.08,
    sort_order: 3,
    description: '三级',
    created_at: '2026-01-03T08:00:00',
    updated_at: '2026-01-12T11:30:00',
  },
  {
    id: 4,
    level_code: 'L4',
    level_name: '推广员',
    commission_rate: 0.05,
    sort_order: 4,
    description: '个人推广',
    created_at: '2026-01-04T08:00:00',
    updated_at: '2026-01-14T16:00:00',
  },
  {
    id: 5,
    level_code: 'L5',
    level_name: '体验档',
    commission_rate: 0.02,
    sort_order: 5,
    description: '试用',
    created_at: '2026-01-05T08:00:00',
    updated_at: '2026-01-05T08:00:00',
  },
  {
    id: 6,
    level_code: 'L6',
    level_name: '企业合作',
    commission_rate: 0.2,
    sort_order: 6,
    description: '大客户',
    created_at: '2026-02-01T08:00:00',
    updated_at: '2026-02-10T10:00:00',
  },
  {
    id: 7,
    level_code: 'L7',
    level_name: '校园大使',
    commission_rate: 0.06,
    sort_order: 7,
    description: '校园',
    created_at: '2026-02-05T08:00:00',
    updated_at: '2026-02-06T09:00:00',
  },
  {
    id: 8,
    level_code: 'L8',
    level_name: '生态伙伴',
    commission_rate: 0.1,
    sort_order: 8,
    description: 'ISV',
    created_at: '2026-02-08T08:00:00',
    updated_at: '2026-02-09T12:00:00',
  },
  {
    id: 9,
    level_code: 'L9',
    level_name: '内部测试',
    commission_rate: 0,
    sort_order: 99,
    description: '仅测试',
    created_at: '2026-02-10T08:00:00',
    updated_at: '2026-02-11T14:00:00',
  },
  {
    id: 10,
    level_code: 'L10',
    level_name: '预留档位 A',
    commission_rate: 0.07,
    sort_order: 10,
    description: '预留',
    created_at: '2026-02-12T08:00:00',
    updated_at: '2026-02-12T08:00:00',
  },
  {
    id: 11,
    level_code: 'L11',
    level_name: '预留档位 B',
    commission_rate: 0.09,
    sort_order: 11,
    description: '预留',
    created_at: '2026-02-13T08:00:00',
    updated_at: '2026-02-13T08:00:00',
  },
  {
    id: 12,
    level_code: 'L12',
    level_name: '预留档位 C',
    commission_rate: 0.11,
    sort_order: 12,
    description: '预留',
    created_at: '2026-02-14T08:00:00',
    updated_at: '2026-02-14T08:00:00',
  },
  {
    id: 13,
    level_code: 'L13',
    level_name: '预留档位 D',
    commission_rate: 0.13,
    sort_order: 13,
    description: '预留',
    created_at: '2026-02-15T08:00:00',
    updated_at: '2026-02-15T08:00:00',
  },
]

let mockAdminPackages: Array<Record<string, unknown>> = [
  {
    id: 101,
    package_code: 'starter',
    name: '入门包',
    price_cny: 50,
    token_quota: 100000,
    description: '体验套餐',
    is_active: true,
    created_at: '2026-01-02T09:00:00',
    updated_at: '2026-01-20T10:00:00',
  },
  {
    id: 102,
    package_code: 'pro',
    name: '专业包',
    price_cny: 299,
    token_quota: 800000,
    description: '个人开发者',
    is_active: true,
    created_at: '2026-01-03T09:00:00',
    updated_at: '2026-01-21T11:00:00',
  },
  {
    id: 103,
    package_code: 'team',
    name: '团队包',
    price_cny: 1299,
    token_quota: 4000000,
    description: '小团队',
    is_active: true,
    created_at: '2026-01-04T09:00:00',
    updated_at: '2026-01-22T12:00:00',
  },
  {
    id: 104,
    package_code: 'enterprise',
    name: '企业包',
    price_cny: 9999,
    token_quota: 40000000,
    description: '企业年付',
    is_active: true,
    created_at: '2026-01-05T09:00:00',
    updated_at: '2026-01-23T13:00:00',
  },
  {
    id: 105,
    package_code: 'payg',
    name: '按量计费',
    price_cny: 0,
    token_quota: 0,
    description: '后付按量',
    is_active: true,
    created_at: '2026-01-06T09:00:00',
    updated_at: '2026-01-24T14:00:00',
  },
  {
    id: 106,
    package_code: 'trial_7d',
    name: '7 日试用',
    price_cny: 1,
    token_quota: 50000,
    description: '试用',
    is_active: false,
    created_at: '2026-01-07T09:00:00',
    updated_at: '2026-01-25T15:00:00',
  },
  {
    id: 107,
    package_code: 'edu',
    name: '教育优惠',
    price_cny: 199,
    token_quota: 600000,
    description: '教育认证',
    is_active: true,
    created_at: '2026-01-08T09:00:00',
    updated_at: '2026-01-26T16:00:00',
  },
  {
    id: 108,
    package_code: 'startup',
    name: '创业包',
    price_cny: 599,
    token_quota: 2000000,
    description: '初创公司',
    is_active: true,
    created_at: '2026-01-09T09:00:00',
    updated_at: '2026-01-27T17:00:00',
  },
  {
    id: 109,
    package_code: 'addon_tokens_1m',
    name: '加油包 1M',
    price_cny: 49,
    token_quota: 1000000,
    description: '叠加包',
    is_active: true,
    created_at: '2026-01-10T09:00:00',
    updated_at: '2026-01-28T18:00:00',
  },
  {
    id: 110,
    package_code: 'addon_tokens_5m',
    name: '加油包 5M',
    price_cny: 199,
    token_quota: 5000000,
    description: '叠加包',
    is_active: true,
    created_at: '2026-01-11T09:00:00',
    updated_at: '2026-01-29T19:00:00',
  },
  {
    id: 111,
    package_code: 'legacy_v1',
    name: '旧版套餐 V1',
    price_cny: 99,
    token_quota: 300000,
    description: '已下线展示',
    is_active: false,
    created_at: '2025-12-01T09:00:00',
    updated_at: '2026-02-01T10:00:00',
  },
  {
    id: 112,
    package_code: 'partner_oem',
    name: 'OEM 合作',
    price_cny: 49999,
    token_quota: 500000000,
    description: '定制',
    is_active: true,
    created_at: '2026-02-02T09:00:00',
    updated_at: '2026-02-02T09:00:00',
  },
  {
    id: 113,
    package_code: 'internal',
    name: '内部划拨',
    price_cny: 0,
    token_quota: 0,
    description: '仅运营',
    is_active: false,
    created_at: '2026-02-03T09:00:00',
    updated_at: '2026-02-03T09:00:00',
  },
]

/** GET /models/services 等 — 与 `parseAdminDataPage` 分页字段一致 */
const mockModelsServicesCatalog: Array<Record<string, unknown>> = Array.from({ length: 23 }, (_, i) => {
  const n = i + 1
  return {
    id: n,
    service_id: n,
    name: `demo-model-${n}`,
    provider: n % 2 === 0 ? 'openai' : 'other',
    description: `Mock service ${n}`,
    status: 'active',
  }
})

/** POST/DELETE `/models/package/:id/models` 时维护的已绑定 model_name 集合 */
const mockPackageBoundModelNames = new Map<number, Set<string>>()

function mockBoundNamesForPackage(packageId: number): Set<string> {
  let s = mockPackageBoundModelNames.get(packageId)
  if (!s) {
    s = new Set(['demo-model-1', 'demo-model-3', 'demo-model-5'])
    mockPackageBoundModelNames.set(packageId, s)
  }
  return s
}

/** 与 OpenAPI `DataResponse` / `ListResponse` 形状对齐的本地假数据 */
function mockBody(method: string, path: string, config?: InternalAxiosRequestConfig): unknown {
  const m = method.toUpperCase()

  if (m === 'GET' && path.includes('/health')) {
    return { status: 'healthy' }
  }

  if (m === 'GET' && /\/dashboard\/?$/.test(path)) {
    const y = new Date().getFullYear()
    return okData({
      stat_year: y,
      total_users: 12840,
      total_agents: 156,
      monthly_revenue: 328450.5,
      monthly_token_usage: 1_842_000_000,
      monthly_withdrawal: 45200,
      total_models: 48,
      yearly_revenue_data: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        revenue: Math.round(180_000 + i * 12_000 + Math.sin(i * 0.7) * 30_000),
      })),
      yearly_token_usage_data: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        token_usage: Math.round(120_000_000 + i * 8_000_000 + Math.sin(i * 0.7) * 20_000_000),
      })),
      yearly_withdrawal_data: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        withdrawal: Math.round(28_000 + i * 1800 + Math.sin(i * 0.7) * 5000),
      })),
      top_token_users: [
        { nickname: '星云科技', token_usage: 186_400_000 },
        { nickname: '蓝海数据', token_usage: 142_900_000 },
        { nickname: '智源实验室', token_usage: 98_200_000 },
        { name: '用户丁', token_usage: 76_500_000 },
        { name: '用户戊', token_usage: 61_200_000 },
        { name: '用户己', token_usage: 54_800_000 },
        { name: '用户庚', token_usage: 48_100_000 },
        { name: '用户辛', token_usage: 39_900_000 },
        { name: '用户壬', token_usage: 32_400_000 },
        { name: '用户癸', token_usage: 28_700_000 },
      ],
      top_packages_by_quantity: [
        { name: '入门包', quantity: 1280 },
        { name: '专业包', quantity: 642 },
        { name: '企业包', quantity: 210 },
      ],
      top_models_by_usage: [
        { model_name: 'gpt-4o', usage_count: 1_250_000 },
        { model_name: 'claude-3-5-sonnet', usage_count: 890_000 },
        { model_name: 'deepseek-chat', usage_count: 620_000 },
      ],
    })
  }

  if (m === 'GET' && path.includes('/config/llm-server')) {
    return okData({
      key: 'api-server',
      value: 'https://your-domain.com/llm/v1',
      description: 'API调用服务地址',
      category: 'business',
    })
  }

  if (m === 'GET' && path.includes('/config/withdrawal-limits')) {
    return okData({
      withdraw_min: 20,
      withdraw_max: 200,
    })
  }

  if (m === 'GET' && path.includes('/config/topup-limits')) {
    return okData({
      topup_min: 10,
    })
  }

  /** ---------- Admin: /admin/agent-levels ---------- */
  if (m === 'GET' && /\/admin\/agent-levels$/.test(path)) {
    const p = (config?.params ?? {}) as Record<string, unknown>
    const sizeRaw = Number(p.pageSize ?? p.size ?? 10)
    const size = Math.min(100, Math.max(1, Number.isFinite(sizeRaw) ? Math.trunc(sizeRaw) : 10))
    const curRaw = Number(p.pageNum ?? p.current ?? 1)
    const current = Math.max(1, Number.isFinite(curRaw) ? Math.trunc(curRaw) : 1)
    const total = mockAdminAgentLevels.length
    const pages = Math.max(1, Math.ceil(total / size))
    const safeCurrent = Math.min(current, pages)
    const start = (safeCurrent - 1) * size
    const records = mockAdminAgentLevels.slice(start, start + size).map((r) => ({ ...r }))
    return okData({ total, pages, current: safeCurrent, size, records })
  }

  if (m === 'GET') {
    const agentDetail = path.match(/\/admin\/agent-levels\/(\d+)$/)
    if (agentDetail) {
      const id = Number(agentDetail[1])
      const rec = mockAdminAgentLevels.find((r) => Number(r.id) === id)
      if (rec) return okData({ ...rec })
      return { code: 404, message: '记录不存在', data: null }
    }
  }

  if (m === 'POST' && /\/admin\/agent-levels\/(\d+)\/delete$/.test(path)) {
    const id = Number(path.match(/\/admin\/agent-levels\/(\d+)\/delete$/)?.[1])
    const before = mockAdminAgentLevels.length
    mockAdminAgentLevels = mockAdminAgentLevels.filter((r) => Number(r.id) !== id)
    if (mockAdminAgentLevels.length < before) return okData(null)
    return { code: 404, message: '记录不存在', data: null }
  }

  if (m === 'POST' && /\/admin\/agent-levels\/(\d+)$/.test(path) && !path.includes('/delete')) {
    const id = Number(path.match(/\/admin\/agent-levels\/(\d+)$/)?.[1])
    const body = mockParseJsonBody(config)
    const idx = mockAdminAgentLevels.findIndex((r) => Number(r.id) === id)
    if (idx < 0) return { code: 404, message: '记录不存在', data: null }
    const cur = { ...mockAdminAgentLevels[idx] }
    for (const [k, v] of Object.entries(body)) {
      if (k === 'id') continue
      ;(cur as Record<string, unknown>)[k] = v
    }
    cur.updated_at = new Date().toISOString()
    mockAdminAgentLevels[idx] = cur
    return okData({ ...cur })
  }

  if (m === 'POST' && /\/admin\/agent-levels$/.test(path)) {
    const body = mockParseJsonBody(config)
    const nextId = mockAdminAgentLevels.reduce((m, r) => Math.max(m, Number(r.id)), 0) + 1
    const now = new Date().toISOString()
    const rec: Record<string, unknown> = { id: nextId, created_at: now, updated_at: now }
    for (const [k, v] of Object.entries(body)) {
      if (k === 'id') continue
      rec[k] = v
    }
    mockAdminAgentLevels.push(rec)
    return okData(rec)
  }

  /** ---------- Admin: /admin/packages ---------- */
  if (m === 'GET' && /\/admin\/packages$/.test(path)) {
    const p = (config?.params ?? {}) as Record<string, unknown>
    const sizeRaw = Number(p.pageSize ?? p.size ?? 10)
    const size = Math.min(100, Math.max(1, Number.isFinite(sizeRaw) ? Math.trunc(sizeRaw) : 10))
    const curRaw = Number(p.pageNum ?? p.current ?? 1)
    const current = Math.max(1, Number.isFinite(curRaw) ? Math.trunc(curRaw) : 1)
    const total = mockAdminPackages.length
    const pages = Math.max(1, Math.ceil(total / size))
    const safeCurrent = Math.min(current, pages)
    const start = (safeCurrent - 1) * size
    const records = mockAdminPackages.slice(start, start + size).map((r) => ({ ...r }))
    return okData({ total, pages, current: safeCurrent, size, records })
  }

  if (m === 'GET') {
    const pkgDetail = path.match(/\/admin\/packages\/(\d+)$/)
    if (pkgDetail) {
      const id = Number(pkgDetail[1])
      const rec = mockAdminPackages.find((r) => Number(r.id) === id)
      if (rec) return okData({ ...rec })
      return { code: 404, message: '记录不存在', data: null }
    }
  }

  if (m === 'POST' && /\/admin\/packages\/(\d+)\/delete$/.test(path)) {
    const id = Number(path.match(/\/admin\/packages\/(\d+)\/delete$/)?.[1])
    const before = mockAdminPackages.length
    mockAdminPackages = mockAdminPackages.filter((r) => Number(r.id) !== id)
    if (mockAdminPackages.length < before) return okData(null)
    return { code: 404, message: '记录不存在', data: null }
  }

  if (m === 'POST' && /\/admin\/packages\/(\d+)$/.test(path) && !path.includes('/delete')) {
    const id = Number(path.match(/\/admin\/packages\/(\d+)$/)?.[1])
    const body = mockParseJsonBody(config)
    const idx = mockAdminPackages.findIndex((r) => Number(r.id) === id)
    if (idx < 0) return { code: 404, message: '记录不存在', data: null }
    const cur = { ...mockAdminPackages[idx] }
    for (const [k, v] of Object.entries(body)) {
      if (k === 'id') continue
      ;(cur as Record<string, unknown>)[k] = v
    }
    cur.updated_at = new Date().toISOString()
    mockAdminPackages[idx] = cur
    return okData({ ...cur })
  }

  if (m === 'POST' && /\/admin\/packages$/.test(path)) {
    const body = mockParseJsonBody(config)
    const nextId = mockAdminPackages.reduce((m, r) => Math.max(m, Number(r.id)), 0) + 1
    const now = new Date().toISOString()
    const rec: Record<string, unknown> = { id: nextId, created_at: now, updated_at: now }
    for (const [k, v] of Object.entries(body)) {
      if (k === 'id') continue
      rec[k] = v
    }
    mockAdminPackages.push(rec)
    return okData(rec)
  }

  /** ---------- Models: GET /models/services, /models/package/:id, /models/services/:id ---------- */
  if (m === 'GET') {
    const svcDetail = path.match(/\/models\/services\/(\d+)$/)
    if (svcDetail) {
      const id = Number(svcDetail[1])
      const rec = mockModelsServicesCatalog.find((r) => Number(r.id) === id)
      if (rec) return okData({ ...rec })
      return { code: 404, message: '模型不存在', data: null }
    }
  }

  if (m === 'POST') {
    const removeModelPost = path.match(/\/models\/package\/(\d+)\/models\/(.+)$/)
    if (removeModelPost) {
      const pid = Number(removeModelPost[1])
      const modelName = decodeURIComponent(removeModelPost[2]!.replace(/\+/g, ' '))
      const set = mockBoundNamesForPackage(pid)
      if (!set.has(modelName)) return { code: 404, message: '绑定不存在', data: null }
      set.delete(modelName)
      return okData({ ok: true })
    }
    const bindPost = path.match(/\/models\/package\/(\d+)\/models$/)
    if (bindPost) {
      const pid = Number(bindPost[1])
      const body = mockParseJsonBody(config)
      const name = String(body.model_name ?? body.modelName ?? body.name ?? '').trim()
      if (!name) return { code: 400, message: 'model_name 不能为空', data: null }
      mockBoundNamesForPackage(pid).add(name)
      return okData({ ok: true })
    }
  }

  if (m === 'GET') {
    const pkgModels = path.match(/\/models\/package\/(\d+)$/)
    if (pkgModels) {
      const pid = Number(pkgModels[1])
      const isAllModels = pid === 999
      const set = mockBoundNamesForPackage(pid)
      const models = [...set].map((model_name) => {
        const rec = mockModelsServicesCatalog.find((r) => String(r.name) === model_name)
        const sid = rec ? Number(rec.id) : 0
        return { service_id: sid, model_name }
      })
      return okData({
        package_id: pid,
        package_name: `Mock 套餐 ${pid}`,
        is_all_models: isAllModels,
        models: isAllModels ? [] : models,
      })
    }
  }

  if (m === 'GET' && /\/models\/services$/.test(path)) {
    const p = (config?.params ?? {}) as Record<string, unknown>
    const sizeRaw = Number(p.pageSize ?? p.size ?? 10)
    const size = Math.min(100, Math.max(1, Number.isFinite(sizeRaw) ? Math.trunc(sizeRaw) : 10))
    const curRaw = Number(p.pageNum ?? p.page ?? p.current ?? 1)
    const current = Math.max(1, Number.isFinite(curRaw) ? Math.trunc(curRaw) : 1)
    const total = mockModelsServicesCatalog.length
    const pages = Math.max(1, Math.ceil(total / size))
    const safeCurrent = Math.min(current, pages)
    const start = (safeCurrent - 1) * size
    const records = mockModelsServicesCatalog.slice(start, start + size).map((r) => ({ ...r }))
    return okData({ total, pages, current: safeCurrent, size, records })
  }

  if (m === 'GET') {
    const detailMatch = path.match(/\/config\/system\/(\d+)$/)
    if (detailMatch) {
      const id = Number(detailMatch[1])
      const rec = mockSystemConfigRecords.find((r) => r.id === id)
      if (rec) return okData({ ...rec })
      return { code: 404, message: '配置不存在', data: null }
    }
  }

  if (m === 'GET' && /\/config\/system$/.test(path)) {
    const p = (config?.params ?? {}) as Record<string, unknown>
    const sizeRaw = Number(p.pageSize ?? p.size ?? p.page_size ?? 10)
    const size = Math.min(100, Math.max(1, Number.isFinite(sizeRaw) ? Math.trunc(sizeRaw) : 10))
    const curRaw = Number(p.pageNum ?? p.pageNumber ?? p.current ?? p.page ?? 1)
    const current = Math.max(1, Number.isFinite(curRaw) ? Math.trunc(curRaw) : 1)
    const total = mockSystemConfigRecords.length
    const pages = Math.max(1, Math.ceil(total / size))
    const safeCurrent = Math.min(current, pages)
    const start = (safeCurrent - 1) * size
    const records = mockSystemConfigRecords.slice(start, start + size).map((r) => ({ ...r }))
    return okData({
      total,
      pages,
      current: safeCurrent,
      size,
      records,
    })
  }

  if (m === 'POST' && /\/config\/system$/.test(path)) {
    const body = mockParseJsonBody(config)
    const key = String(body.config_key ?? body.configKey ?? '').trim()
    if (!key) {
      return { code: 400, message: 'config_key 不能为空', data: null }
    }
    if (mockSystemConfigRecords.some((r) => r.config_key === key)) {
      return { code: 400, message: '配置键已存在', data: null }
    }
    const nextId = mockSystemConfigRecords.reduce((m, r) => Math.max(m, r.id), 0) + 1
    const del = body.is_deleted === true || body.is_deleted === 1 || body.isDeleted === true
    const rec: MockSystemConfigRecord = {
      id: nextId,
      config_key: key,
      config_value: String(body.config_value ?? body.configValue ?? '').trim(),
      description: String(body.description ?? '').trim() || '—',
      category: String(body.category ?? 'business').trim() || 'business',
      is_deleted: del,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    mockSystemConfigRecords.push(rec)
    return okData(rec)
  }

  if (m === 'POST') {
    const deleteMatch = path.match(/\/config\/system\/(\d+)\/delete\/?$/)
    if (deleteMatch) {
      const id = Number(deleteMatch[1])
      const before = mockSystemConfigRecords.length
      mockSystemConfigRecords = mockSystemConfigRecords.filter((r) => r.id !== id)
      if (mockSystemConfigRecords.length < before) return okData(null)
      return { code: 404, message: '配置不存在', data: null }
    }

    const updateMatch = path.match(/\/config\/system\/(\d+)$/)
    if (updateMatch) {
      const id = Number(updateMatch[1])
      const body = mockParseJsonBody(config)
      const idx = mockSystemConfigRecords.findIndex((r) => r.id === id)
      if (idx >= 0) {
        const ck = body.config_key ?? body.configKey
        if (typeof ck === 'string' && ck.trim()) {
          mockSystemConfigRecords[idx].config_key = ck.trim()
        }
        if (typeof body.description === 'string') {
          mockSystemConfigRecords[idx].description = body.description.trim() || '—'
        }
        const cv = body.config_value ?? body.configValue
        if (typeof cv === 'string') {
          mockSystemConfigRecords[idx].config_value = cv.trim()
        }
        const cat = body.category
        if (typeof cat === 'string' && cat.trim()) {
          mockSystemConfigRecords[idx].category = cat.trim()
        }
        const del = body.is_deleted ?? body.isDeleted
        if (del === true || del === 1 || del === '1' || del === 'true') {
          mockSystemConfigRecords[idx].is_deleted = true
        } else if (del === false || del === 0 || del === '0' || del === 'false') {
          mockSystemConfigRecords[idx].is_deleted = false
        }
        const ca = body.created_at ?? body.createdAt
        if (typeof ca === 'string' && ca.trim()) {
          mockSystemConfigRecords[idx].created_at = ca.trim()
        }
        const ua = body.updated_at ?? body.updatedAt
        if (typeof ua === 'string' && ua.trim()) {
          mockSystemConfigRecords[idx].updated_at = ua.trim()
        } else {
          mockSystemConfigRecords[idx].updated_at = new Date().toISOString()
        }
        return okData({ ...mockSystemConfigRecords[idx] })
      }
      return okData(null)
    }
  }

  if (m === 'GET' && (path === '/' || path.endsWith('/'))) {
    return { message: 'Welcome to AI Token Nexus API', version: '1.0.0', docs: '/docs' }
  }

  if (m === 'GET' && path.includes('/user/me')) {
    return okData({
      id: 1,
      nickname: '演示用户',
      name: '演示用户',
      is_admin: false,
      invite_code: 'DEMO123',
      /** 邀请页「当前剩余佣金」等与线上一致时可放在 me 上 */
      commission: '0.00 CNY',
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=aitoken',
      /** 已购代理档位 id 或 level；改为正整数可测「当前已购套餐」按钮 */
      agent_level: null,
    })
  }

  if (m === 'PUT' && path.includes('/user/me')) {
    return okData({ id: 1, nickname: '已更新' })
  }

  if (m === 'GET' && path.includes('/user/invited-users')) {
    return okList([
      {
        id: 1,
        name: 'Friend',
        invite_status: 'COMPLETED',
        reward_amount: '10.00',
        invited_at: '2026-04-10T12:00:00',
      },
      {
        id: 2,
        name: 'Peer',
        invite_status: 'PENDING',
        reward_amount: '0.00',
        invited_at: '2026-04-11T09:30:00',
      },
    ])
  }

  if (m === 'GET' && path.includes('/account/balance')) {
    return okData({
      balance: 128.5,
      commission: 12.34,
      used_tokens_daily: 3_200,
      used_tokens: 42_000,
      currency: 'CNY',
    })
  }

  if (m === 'GET' && path.includes('/account/transactions')) {
    const { limit, offset } = limitOffsetFromConfig(config)
    const all = Array.from({ length: 23 }, (_, i) => {
      const amt = i % 2 === 0 ? '-12.50' : '100.00'
      const before = (100 - i * 2).toFixed(2)
      const after = i % 2 === 0 ? (100 - i * 2 - 12.5).toFixed(2) : (100 - i * 2 + 100).toFixed(2)
      return {
        id: i + 1,
        account_type: 'balance',
        type: i % 2 === 0 ? 'package' : 'recharge',
        amount: amt,
        balance_before: before,
        balance_after: after,
        related_id: 1000 + i,
        description: i % 2 === 0 ? '套餐扣费（演示）' : '账户充值（演示）',
        created_at: new Date(Date.now() - i * 3_600_000).toISOString(),
      }
    })
    return okPaginatedList(all, limit, offset)
  }

  if (m === 'POST' && path.includes('/account/topup')) {
    const orderId = nextMockOrderId()
    mockPaymentOrderIds.add(orderId)
    return okData({
      order_id: orderId,
      status: 'pending',
      code_url: 'weixin://wxpay/bizpayurl?pr=demo_recharge',
    })
  }

  if (m === 'POST' && path.includes('/account/agent/register')) {
    const orderId = nextMockOrderId()
    mockPaymentOrderIds.add(orderId)
    return okData({
      order_id: orderId,
      status: 'pending',
      code_url: 'weixin://wxpay/bizpayurl?pr=demo_agent_register',
    })
  }

  if (m === 'GET' && path.includes('/api-keys/models')) {
    return okList([
      { name: 'minimax-m2.7' },
      { name: 'gemma-4-31b-it' },
      { name: 'glm-4.7-flash' },
      { name: 'deepseek-r1-distill-qwen-7b' },
      { name: 'qwen3.5-27b-claude-sonnet' },
      { name: 'gpt-4o-mini' },
    ])
  }

  if (m === 'GET' && path.includes('/api-keys') && !path.match(/\/api-keys\/\d/)) {
    return okList([
      {
        id: 1,
        name: 'prod',
        api_key: 'sk-mock-prod-aaaaaaaaaaaaaaaaaaaaaaaa',
        masked_key: 'ak_live_…a1b2',
        created_at: '2026-03-01T08:00:00.000Z',
        last_used_at: '2026-04-01T10:00:00.000Z',
        package_type: 'common',
        package_id: 4,
      },
      {
        id: 2,
        name: 'test',
        api_key: 'sk-mock-test-bbbbbbbbbbbbbbbbbbbbbbbb',
        masked_key: 'ak_test_…c3d4',
        created_at: '2026-02-15T12:30:00.000Z',
        package_type: 'package',
        package_id: 1,
      },
    ])
  }

  if (m === 'POST' && path.includes('/api-keys') && !path.match(/\/api-keys\/\d/)) {
    return okData({
      id: 99,
      name: 'new-key',
      api_key: `sk-mock-${crypto.randomUUID?.() ?? Date.now()}`,
    })
  }

  if (m === 'DELETE' && path.match(/\/api-keys\/\d+/)) {
    return okData({ deleted: true })
  }

  if (m === 'PUT' && path.includes('/api-keys/') && path.includes('/status')) {
    return okData({ id: 1, status: 'disabled' })
  }

  if (m === 'GET' && path.endsWith('/packages') && !path.includes('/packages/user')) {
    return okList([
      { id: 4, name: '按量计费', price: 0, description: '按量使用', package_type: 'common' },
      {
        id: 1,
        name: '入门包',
        price: 50,
        credits: 50,
        package_type: 'package',
        is_all_models: true,
        models: [],
      },
      {
        id: 2,
        name: '专业包',
        price: 200,
        credits: 220,
        package_type: 'package',
        is_all_models: false,
        models: [{ model_name: 'demo-model-a' }, { name: 'demo-model-b' }],
      },
    ])
  }

  if (m === 'GET' && path.includes('/packages/user')) {
    return okList([
      {
        id: 2,
        status: 'active',
        start_at: '2025-03-08T10:44:40',
        end_at: '2125-03-08T10:44:40',
        package: [
          { id: 4, name: '按量计费', price: '0.00', duration_days: 0, package_type: 'common', description: '按量使用' },
          {
            id: 1,
            name: '入门包',
            price: '50.00',
            credits: 50,
            duration_days: 30,
            package_type: 'package',
            description: '入门额度',
          },
        ],
      },
    ])
  }

  if (m === 'POST' && path.includes('/packages/') && path.includes('/purchase')) {
    const orderId = nextMockOrderId()
    mockPaymentOrderIds.add(orderId)
    return okData({
      order_id: orderId,
      status: 'pending',
      code_url: 'weixin://wxpay/bizpayurl?pr=demo_package',
    })
  }

  if (m === 'GET' && path.includes('/orders') && !path.match(/\/orders\/\d+/)) {
    const { limit, offset } = limitOffsetFromConfig(config)
    const all = Array.from({ length: 37 }, (_, i) => ({
      order_no: `ORD177623873905F${String(i + 1).padStart(3, '0')}`,
      amount: 100,
      status: (['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const)[i % 4],
      created_at: new Date(Date.now() - i * 3_600_000).toISOString(),
    }))
    return okPaginatedList(all, limit, offset)
  }

  if (m === 'GET' && path.match(/\/orders\/\d+/)) {
    const match = path.match(/\/orders\/(\d+)/)
    const orderId = match ? Number(match[1]) : 0
    if (orderId > 0 && mockPaymentOrderIds.has(orderId)) {
      return okData({ id: orderId, amount: 99, status: 'paid' })
    }
    return okData({ id: orderId || 1, amount: 99, status: 'paid' })
  }

  if (m === 'POST' && path.includes('/payments/wechat/native')) {
    return okData({ payment_id: 'pay_1', status: 'pending', qr_url: 'https://example.com/qr' })
  }

  if (m === 'POST' && path.includes('/payments/wechat/callback')) {
    return okData({ ok: true })
  }

  if (m === 'POST' && path.includes('/withdrawals/wechat')) {
    return okData({
      withdrawal_id: 2,
      status: 'pending',
      package_info: 'mock_package_info_for_wechat_confirm_demo',
    })
  }

  if (m === 'GET' && path.includes('/withdrawals') && !path.match(/\/withdrawals\/\d+/)) {
    return okList([
      {
        id: 1,
        amount: 50,
        bank_account: '',
        status: 'completed',
        out_batch_no: 'mock_batch_001',
        transfer_bill_no: 'mock_bill_001',
        failure_reason: null,
        created_at: '2026-04-17T17:24:38.000Z',
      },
    ])
  }

  if (m === 'GET' && path.match(/\/withdrawals\/\d+/)) {
    return okData({
      id: 1,
      amount: 50,
      bank_account: '',
      status: 'pending_user_confirm',
      out_batch_no: 'mock_out_batch',
      transfer_bill_no: 'mock_transfer_bill',
      package_info: 'mock_package_info_for_detail_confirm',
      failure_reason: null,
      created_at: '2026-04-17T17:24:38.000Z',
      updated_at: '2026-04-17T17:24:38.000Z',
    })
  }

  if (m === 'GET' && path.endsWith('/invites')) {
    return okData({ invite_code: 'DEMO123', rewards_claimed: 0 })
  }

  if (m === 'POST' && path.endsWith('/invites/bind')) {
    return okData({ ok: true })
  }

  if (m === 'POST' && path.includes('/invites/reward/')) {
    return okData({ reward: 10, currency: 'CNY' })
  }

  if (m === 'GET' && path.includes('/token-usage') && !path.includes('/summary')) {
    return okList([
      {
        id: 1,
        model_name: 'gpt-4o',
        total_tokens: 1200,
        created_at: new Date().toISOString(),
      },
    ])
  }

  if (m === 'GET' && path.includes('/token-usage/summary')) {
    return okData({
      period: '2026-04',
      total_tokens: 1_240_000,
      total_requests: 8832,
    })
  }

  return okData({ message: 'mock: no specific handler', path, method: m })
}

export async function mockAxiosAdapter(
  config: InternalAxiosRequestConfig,
): Promise<AxiosResponse> {
  const method = (config.method ?? 'get').toUpperCase()
  const path = pathFromConfig(config)
  if (method === 'GET' && path.includes('/agents/levels')) {
    return forwardAgentsLevelsToBackend(config)
  }

  await delay(450 + Math.floor(Math.random() * 350))
  const data = mockBody(method, path, config)

  const response: AxiosResponse = {
    data,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    config,
  }
  return response
}
