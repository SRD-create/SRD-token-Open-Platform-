import type { TFunction } from 'i18next'
import type { ModelServiceRecord } from '@/api/modelSquare'
import { safeString } from '@/lib/safe'

export type ModelPriceTier = {
  contextRangeMin: number
  contextRangeMax: number
  /** 元 / token，与顶层 `input_token_price` 同口径 */
  inputTokenPrice: number
  outputTokenPrice: number
  cacheStoragePrice: number | null
  cacheHitPrice: number | null
  /** 接口若返回文案（如「限时免费」），优先展示 */
  cacheStorageNote: string | null
}

export type ModelItem = {
  id: string
  name: string
  vendor: string
  vendorId: string
  typeId: string
  typeLabel: string
  desc: string
  inputPerK: string
  outputPerK: string
  inputTokenPrice?: number | null
  outputTokenPrice?: number | null
  /** 来自 `prices` / `price` 分档；无则空数组，弹窗回退单层展示 */
  priceTiers: ModelPriceTier[]
  tags: string[]
  context: string
  params: string
  healthy: boolean
}

export type PricingGranularity = 'perToken' | 'per1k' | 'per1m'

export const PRICING_TOKEN_MULT: Record<PricingGranularity, number> = {
  perToken: 1,
  per1k: 1000,
  per1m: 1_000_000,
}

export function formatYuanForTokenBatch(pricePerToken: number | undefined | null, tokenCount: number): string {
  if (pricePerToken == null || Number.isNaN(pricePerToken)) return '—'
  const y = pricePerToken * tokenCount
  if (y === 0) return '¥0'
  const abs = Math.abs(y)
  const decimals = abs >= 1 ? 4 : abs >= 0.0001 ? 6 : abs >= 0.00000001 ? 8 : 10
  const s = y.toFixed(decimals)
  return `¥${s.replace(/\.?0+$/, '')}`
}

export function formatYuanPerKTokens(pricePerToken?: number | null): string {
  return formatYuanForTokenBatch(pricePerToken ?? null, 1000)
}

/** 超过该上限的 `context_range_max` 视为「无上限」展示为 `+)` */
const PRICE_TIER_OPEN_END_MAX = 100_000_000

function parsePriceTierNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function parseModelPriceTiersFromRecord(r: ModelServiceRecord): ModelPriceTier[] {
  const raw = Array.isArray(r.prices)
    ? r.prices
    : Array.isArray(r.price)
      ? r.price
      : []
  const out: ModelPriceTier[] = []
  for (const it of raw) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue
    const o = it as Record<string, unknown>
    const cmin = parsePriceTierNumber(o.context_range_min ?? o.contextRangeMin)
    const cmax = parsePriceTierNumber(o.context_range_max ?? o.contextRangeMax)
    const pin = parsePriceTierNumber(o.input_token_price ?? o.inputTokenPrice)
    const pout = parsePriceTierNumber(o.output_token_price ?? o.outputTokenPrice)
    if (cmin == null || cmax == null || pin == null || pout == null) continue
    const cacheNote = safeString(o.cache_storage_note ?? o.cacheStorageNote).trim() || null
    const pcache = parsePriceTierNumber(o.cache_storage_price ?? o.cacheStoragePrice)
    const phit = parsePriceTierNumber(o.cache_hit_price ?? o.cacheHitPrice)
    out.push({
      contextRangeMin: cmin,
      contextRangeMax: cmax,
      inputTokenPrice: pin,
      outputTokenPrice: pout,
      cacheStoragePrice: pcache,
      cacheHitPrice: phit,
      cacheStorageNote: cacheNote,
    })
  }
  out.sort((a, b) => a.contextRangeMin - b.contextRangeMin || a.contextRangeMax - b.contextRangeMax)
  return out
}

function formatKTokenSegment(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Number.isInteger(n)) return String(Math.trunc(n))
  const s = n
    .toFixed(6)
    .replace(/0+$/, '')
    .replace(/\.$/, '')
  return s || '0'
}

/** 上下文区间文案：千 tokens 维度，如「输入长度 [0, 32]」 */
export function formatPriceTierContextLabel(
  minTokens: number,
  maxTokens: number,
  t: TFunction,
): string {
  const minK = minTokens / 1000
  const maxK = maxTokens / 1000
  if (maxTokens >= PRICE_TIER_OPEN_END_MAX) {
    return t('models.detailPriceContextOpen', { min: formatKTokenSegment(minK) })
  }
  return t('models.detailPriceContextClosed', {
    min: formatKTokenSegment(minK),
    max: formatKTokenSegment(maxK),
  })
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ')

/**
 * 当 description 首行与模型名一致时（接口常把名称再写进简介首行），去掉该行，避免与卡片标题/浮层重复。
 * 去完后为空则回退为原文，避免无内容。
 */
export function stripDuplicateNameLineFromDesc(name: string, desc: string): string {
  const d = desc.trim()
  if (!d) return desc
  const nameN = norm(name)
  if (!nameN) return desc
  const parts = desc.split(/\r?\n/)
  if (norm(parts[0] ?? '') !== nameN) return desc
  const rest = parts.slice(1).join('\n').trim()
  return rest || desc
}

export function mapRecordToModelItem(r: ModelServiceRecord, t: TFunction): ModelItem {
  const contextK = Math.max(1, Math.round(r.max_context_length / 1000))
  const tags = [
    r.model_type_label,
    t('models.tagContext', { k: contextK }),
    r.parameters ? t('models.tagParams', { p: r.parameters }) : '',
  ].filter(Boolean)
  const priceTiers = parseModelPriceTiersFromRecord(r)
  return {
    id: r.name,
    name: r.name,
    vendor: r.provider_label,
    vendorId: r.provider,
    typeId: r.model_type,
    typeLabel: r.model_type_label,
    desc: r.description,
    inputPerK: formatYuanPerKTokens(r.input_token_price),
    outputPerK: formatYuanPerKTokens(r.output_token_price),
    inputTokenPrice: r.input_token_price,
    outputTokenPrice: r.output_token_price,
    priceTiers,
    tags,
    context: `${contextK}K`,
    params: r.parameters?.trim() || '—',
    healthy: r.status === 'healthy',
  }
}
