import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { useAuth } from '@/auth/useAuth'
import { LoginPanel } from '@/components/LoginPanel'

type LoginModalProps = {
  open: boolean
  onClose: () => void
  /** 检测到已登录并即将关闭弹窗时调用（先于 onClose） */
  onAuthenticated?: () => void
}

export function LoginModal({ open, onClose, onAuthenticated }: LoginModalProps) {
  const { token } = useAuth()
  /** 本次弹窗打开时是否尚未登录（用于区分「打开后才登录」与「已登录仍打开弹窗」） */
  const openedUnauthenticatedRef = useRef(false)
  const prevOpenRef = useRef(false)

  useEffect(() => {
    if (!open) {
      openedUnauthenticatedRef.current = false
      prevOpenRef.current = false
      return
    }
    if (!prevOpenRef.current) {
      openedUnauthenticatedRef.current = !token
      prevOpenRef.current = true
    }
  }, [open, token])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !token) return
    if (openedUnauthenticatedRef.current) {
      onAuthenticated?.()
      openedUnauthenticatedRef.current = false
    }
    onClose()
  }, [open, token, onAuthenticated, onClose])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:p-4"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-modal-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative max-h-[min(100dvh-1rem,640px)] w-full max-w-sm overflow-y-auto overscroll-y-contain rounded-2xl border border-white/[0.08] bg-surface-850/95 p-6 shadow-panel backdrop-blur-xl sm:p-8"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
              aria-label="关闭"
            >
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
            </button>
            <LoginPanel titleId="login-modal-title" />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
