import { useCallback, useLayoutEffect } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faClock, faEnvelope, faMobileScreen } from '@fortawesome/free-solid-svg-icons'
import { ContentNotice } from '@/components/ContentNotice'
import { copyTextToClipboard } from '@/lib/copyToClipboard'
import { notify } from '@/lib/toast'
import {
  landingContentShellClass,
  landingModelSquarePaddingTopClass,
  landingPillOutlineClass,
  landingPillPrimaryClass,
} from '@/landing/landingContentShell'

const pageWrap = `${landingContentShellClass} ${landingModelSquarePaddingTopClass} pb-8 md:pb-10`

export function ContactPage() {
  const { t } = useTranslation()

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const supportEmail = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || t('contact.emailValue')

  const mailtoHref = `mailto:${supportEmail}`

  const copyEmail = useCallback(async () => {
    const ok = await copyTextToClipboard(supportEmail)
    if (ok) notify.success(t('contact.toast.emailCopied'))
    else notify.error(t('contact.toast.copyFail'))
  }, [supportEmail, t])

  const onPhoneCta = useCallback(() => {
    notify.message(t('contact.phone.toast'))
  }, [t])

  const cardShell =
    'flex h-full min-h-0 flex-col rounded-xl border border-white/[0.08] bg-surface-850/80 p-4 shadow-panel md:p-5'

  const iconBox = 'flex h-10 w-10 items-center justify-center rounded-lg text-white shadow-md'

  return (
    <main className="relative z-10 min-h-0 flex-1">
        <div className={pageWrap}>
          <ContentNotice className="mb-5 md:mb-6" role="note">
            <p className="text-[13px] leading-snug md:text-sm md:leading-snug">
              <span className="font-semibold">{t('contact.notice.tip')}</span>
              {t('contact.notice.line1')}
            </p>
            <p className="mt-2 text-[13px] leading-snug md:text-sm md:leading-snug">
              <Trans
                i18nKey="contact.notice.line2"
                components={{
                  hl: <span className="font-semibold text-sky-400" />,
                }}
              />
            </p>
          </ContentNotice>

          <header className="mb-8 md:mb-10">
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              {t('contact.title')}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400 md:text-base">
              {t('contact.subtitle')}
            </p>
          </header>

          <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch md:gap-5">
            {/* 邮件 */}
            <section className={`min-w-0 ${cardShell}`}>
              <div className={`${iconBox} bg-sky-500 shadow-sky-900/30`}>
                <FontAwesomeIcon icon={faEnvelope} className="h-[1.05rem] w-[1.05rem]" aria-hidden />
              </div>
              <h2 className="mt-3 text-sm font-semibold text-white">{t('contact.email.title')}</h2>
              <a
                href={mailtoHref}
                className="mt-2 break-all text-sm font-medium leading-snug text-sky-400 transition hover:text-sky-300"
              >
                {supportEmail}
              </a>
              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                <a href={mailtoHref} className={`${landingPillPrimaryClass} min-w-0 flex-1 sm:flex-none`}>
                  {t('contact.email.cta')}
                </a>
                <button
                  type="button"
                  onClick={() => void copyEmail()}
                  className={`${landingPillOutlineClass} min-w-0 flex-1 text-zinc-200 sm:flex-none`}
                >
                  {t('contact.email.copy')}
                </button>
              </div>
            </section>

            {/* 电话 */}
            <section
              className={`min-w-0 ${cardShell} bg-surface-900/90 ring-1 ring-white/[0.06] shadow-[0_12px_40px_-18px_rgba(0,0,0,0.5)]`}
            >
              <div className={`${iconBox} bg-gradient-to-br from-violet-500 to-blue-600`}>
                <FontAwesomeIcon icon={faMobileScreen} className="h-[1.05rem] w-[1.05rem]" aria-hidden />
              </div>
              <h2 className="mt-3 text-sm font-semibold text-white">{t('contact.phone.title')}</h2>
              <p className="mt-2 flex-1 text-sm font-medium leading-snug text-sky-400">{t('contact.phone.na')}</p>
              <div className="mt-auto flex min-h-9 items-end pt-3">
                <button type="button" onClick={onPhoneCta} className={`${landingPillPrimaryClass} w-full sm:w-auto`}>
                  {t('contact.phone.cta')}
                </button>
              </div>
            </section>

            {/* 在线时间 */}
            <section className={`min-w-0 ${cardShell}`}>
              <div className={`${iconBox} bg-gradient-to-br from-amber-400 to-orange-500`}>
                <FontAwesomeIcon icon={faClock} className="h-[1.05rem] w-[1.05rem]" aria-hidden />
              </div>
              <h2 className="mt-3 text-sm font-semibold text-white">{t('contact.hours.title')}</h2>
              <p className="mt-2 flex-1 text-sm leading-snug text-zinc-400">{t('contact.hours.value')}</p>
              {/* 占位：与左侧按钮行同高，三卡底边对齐 */}
              <div className="mt-auto min-h-9 pt-3" aria-hidden />
            </section>
          </div>
        </div>
    </main>
  )
}
