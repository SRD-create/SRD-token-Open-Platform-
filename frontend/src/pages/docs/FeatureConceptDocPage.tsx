import { useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { scrollDocsMainToTop } from '@/lib/scrollDocsMain'
import { DocsFooterNav } from '@/pages/docs/DocsFooterNav'

export type FeatureDocTopic = 'selfBuilt' | 'hardcore' | 'costPerf' | 'privacy'

const SECTION_KEYS = ['s1', 's2', 's3', 's4'] as const

/** 与首页能力卡对应的说明文档（公开介绍；`privacy` 在侧栏与页脚均可进入） */
export function FeatureConceptDocPage({ topic }: { topic: FeatureDocTopic }) {
  const { t } = useTranslation()
  const base = `docsFeature.${topic}` as const

  useLayoutEffect(() => {
    scrollDocsMainToTop()
  }, [topic])

  return (
    <div className="relative min-h-0 w-full min-w-0 flex-1 pb-16 md:pb-20">
      <h1 className="sr-only">{t(`${base}.title`)}</h1>

      <section className="mb-12 md:mb-14">
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
          {t(`${base}.title`)}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400 md:text-base">{t(`${base}.intro`)}</p>
      </section>

      {SECTION_KEYS.map((key) => (
        <section key={key} className="mb-10 md:mb-12">
          <h2 className="text-xl font-semibold text-white md:text-2xl">{t(`${base}.${key}.title`)}</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400 md:text-base">{t(`${base}.${key}.body`)}</p>
        </section>
      ))}
      <DocsFooterNav />
    </div>
  )
}
