import { useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { scrollDocsMainToTop } from '@/lib/scrollDocsMain'
import { DocsFooterNav } from '@/pages/docs/DocsFooterNav'

const SECTION_KEYS = ['s1', 's2', 's3', 's4'] as const

/** 文档中心 — 代理加盟规则（公开说明，与 /partners 商务条款衔接） */
export function PartnerRulesDocPage() {
  const { t } = useTranslation()

  useLayoutEffect(() => {
    scrollDocsMainToTop()
  }, [])

  return (
    <div className="relative min-h-0 w-full min-w-0 flex-1 pb-16 md:pb-20">
      <h1 className="sr-only">{t('docsPartnerRules.title')}</h1>

      <section className="mb-12 md:mb-14">
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
          {t('docsPartnerRules.title')}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400 md:text-base">{t('docsPartnerRules.intro')}</p>
      </section>

      {SECTION_KEYS.map((key) => (
        <section key={key} className="mb-10 md:mb-12">
          <h2 className="text-xl font-semibold text-white md:text-2xl">{t(`docsPartnerRules.${key}.title`)}</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400 md:text-base">{t(`docsPartnerRules.${key}.body`)}</p>
        </section>
      ))}
      <DocsFooterNav />
    </div>
  )
}
