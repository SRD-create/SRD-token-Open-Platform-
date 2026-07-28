import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getDocsSequentialNeighbors } from '@/pages/docs/docsNavFlow'

const linkClass =
  'inline-flex min-w-0 max-w-[min(100%,18rem)] items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-accent/35 hover:bg-accent/[0.08] hover:text-white'

export function DocsFooterNav() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { prev, next } = useMemo(() => getDocsSequentialNeighbors(pathname), [pathname])

  if (!prev && !next) return null

  return (
    <nav
      className="mt-14 flex flex-col gap-3 border-t border-white/[0.08] pt-8 sm:flex-row sm:items-stretch sm:justify-between"
      aria-label={t('docsLayout.seqNavAria')}
    >
      {prev ? (
        <Link to={prev.path} className={`${linkClass} sm:justify-start`}>
          <span className="shrink-0 text-zinc-500" aria-hidden>
            ←
          </span>
          <span className="min-w-0 truncate">{t(prev.titleKey)}</span>
        </Link>
      ) : (
        <span className="hidden sm:block sm:flex-1" />
      )}
      {next ? (
        <Link to={next.path} className={`${linkClass} sm:ml-auto sm:justify-end`}>
          <span className="min-w-0 truncate text-right">{t(next.titleKey)}</span>
          <span className="shrink-0 text-zinc-500" aria-hidden>
            →
          </span>
        </Link>
      ) : null}
    </nav>
  )
}
