/** 文档中心推荐阅读顺序（与侧栏一致；用于底部上一篇/下一篇） */
export const DOCS_READING_ORDER: { path: string; titleKey: string }[] = [
  { path: '/docs', titleKey: 'docsLayout.navApiDocs' },
  { path: '/docs/self-built', titleKey: 'docsLayout.navFeatureSelfBuilt' },
  { path: '/docs/hardcore', titleKey: 'docsLayout.navFeatureHardcore' },
  { path: '/docs/cost-performance', titleKey: 'docsLayout.navFeatureCostPerf' },
  { path: '/docs/partner-rules', titleKey: 'docsLayout.navPartnerRules' },
  { path: '/docs/privacy', titleKey: 'docsLayout.navPrivacy' },
]

function normalizeDocPath(pathname: string): string {
  let p = pathname || '/'
  if (p.length > 1) p = p.replace(/\/+$/, '')
  return p
}

/** 主阅读链上的上一篇 / 下一篇（与侧栏顺序一致）。 */
export function getDocsSequentialNeighbors(pathname: string): {
  prev: { path: string; titleKey: string } | null
  next: { path: string; titleKey: string } | null
} {
  const n = normalizeDocPath(pathname)
  const i = DOCS_READING_ORDER.findIndex((x) => normalizeDocPath(x.path) === n)
  if (i < 0) return { prev: null, next: null }
  const prev = i > 0 ? DOCS_READING_ORDER[i - 1]! : null
  const next = i < DOCS_READING_ORDER.length - 1 ? DOCS_READING_ORDER[i + 1]! : null
  return { prev, next }
}
