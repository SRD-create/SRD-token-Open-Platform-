import { safeArray, safeRecord } from '@/lib/safe'

/**
 * Renders API payloads as-is (no invented fields). Nested objects/arrays recurse.
 */
export function DataView({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) {
    return <span className="text-zinc-500">null</span>
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span className="break-all text-zinc-200">{String(value)}</span>
  }

  if (Array.isArray(value)) {
    const items = safeArray<unknown>(value)
    if (items.length === 0) {
      return <span className="text-zinc-500">[]</span>
    }
    return (
      <ul className={`space-y-2 ${depth > 0 ? 'border-l border-white/10 pl-3' : ''}`}>
        {items.map((item, i) => (
          <li key={i} className="rounded-lg bg-white/[0.03] px-3 py-2">
            <DataView value={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    )
  }

  const obj = safeRecord(value)
  const entries = Object.entries(obj)
  if (entries.length === 0) {
    return <span className="text-zinc-500">{'{}'}</span>
  }

  return (
    <dl
      className={`grid gap-2 sm:grid-cols-2 ${depth > 0 ? 'border-l border-white/10 pl-3' : ''}`}
    >
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="rounded-lg bg-white/[0.03] px-3 py-2 shadow-inner shadow-black/20"
        >
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{k}</dt>
          <dd className="mt-1 text-sm">
            <DataView value={v} depth={depth + 1} />
          </dd>
        </div>
      ))}
    </dl>
  )
}
