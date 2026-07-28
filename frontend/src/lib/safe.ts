/** Defensive helpers so missing API fields never crash the UI. */

export function safeString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

export function safeRecord(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {}
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

export function safeArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}
