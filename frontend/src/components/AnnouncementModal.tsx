import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Trans, useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'

const overlayTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const }
const dialogTransition = { duration: 0.34, ease: [0.22, 1, 0.36, 1] as const }

const modelNameClass = 'font-medium text-zinc-200'

function NoticePanel() {
  const { t } = useTranslation()

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-4"
    >
      <section className="rounded-xl border border-amber-500/35 bg-amber-500/[0.12] px-4 py-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:py-3">
        <p className="text-sm font-semibold text-amber-200">{t('announcementModal.promo')}</p>
      </section>

      <section className="rounded-xl border border-white/[0.08] bg-surface-850/60 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-white">{t('announcementModal.serviceTitle')}</h3>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-bold tabular-nums text-sky-400 sm:text-xl">538+</p>
            <p className="mt-1 text-[10px] leading-tight text-zinc-500 sm:text-xs">
              {t('announcementModal.statUptime')}
            </p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums text-sky-400 sm:text-xl">99.9%</p>
            <p className="mt-1 text-[10px] leading-tight text-zinc-500 sm:text-xs">
              {t('announcementModal.statAvailability')}
            </p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums text-sky-400 sm:text-xl">18+</p>
            <p className="mt-1 text-[10px] leading-tight text-zinc-500 sm:text-xs">
              {t('announcementModal.statNodes')}
            </p>
          </div>
        </div>
        <ul className="mt-4 space-y-2.5 text-xs leading-relaxed text-zinc-400 sm:text-sm">
          <li className="flex gap-2">
            <span className="shrink-0" aria-hidden>
              ⚡
            </span>
            <span>{t('announcementModal.bulletLoadBalance')}</span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0" aria-hidden>
              💪
            </span>
            <span>{t('announcementModal.bulletConcurrency')}</span>
          </li>
        </ul>
      </section>

      <section className="rounded-xl border border-white/[0.08] bg-surface-850/60 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-white">{t('announcementModal.updatesTitle')}</h3>
        <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-zinc-400 sm:text-sm">
          <li className="flex gap-2">
            <span className="shrink-0" aria-hidden>
              🆕
            </span>
            <span>
              <Trans
                i18nKey="announcementModal.updatesModels"
                components={{
                  m1: <span className={modelNameClass} />,
                  m2: <span className={modelNameClass} />,
                }}
              />
            </span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0" aria-hidden>
              🔧
            </span>
            <span>{t('announcementModal.updatesAsync')}</span>
          </li>
        </ul>
      </section>
    </motion.div>
  )
}

type AnnouncementModalProps = {
  open: boolean
  onClose: () => void
}

/** 系统公告时间线入口已暂时移除；恢复时需重新加入 Tab 与 Timeline 面板。通知正文见 `announcementModal` i18n 键。 */

export function AnnouncementModal({ open, onClose }: AnnouncementModalProps) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /** 挂到 body，避免放在带 backdrop-blur / transform 的顶栏内导致 fixed 相对错误、弹窗被裁切 */
  const tree = (
    <AnimatePresence mode="wait">
      {open ? (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/65 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:p-3 md:p-4"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={overlayTransition}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="announcement-modal-title"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={dialogTransition}
            className="relative mx-auto flex max-h-[min(90dvh,820px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-surface-900/95 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.75)] backdrop-blur-xl sm:w-full"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
              <h2
                id="announcement-modal-title"
                className="text-base font-semibold tracking-tight text-white sm:text-lg"
              >
                {t('announcementModal.title')}
              </h2>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-200"
                  aria-label={t('announcementModal.closeAria')}
                >
                  <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="scrollbar-surface min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-5 sm:py-5">
              <NoticePanel />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(tree, document.body)
}
