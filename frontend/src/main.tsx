import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleCheck,
  faCircleInfo,
  faCircleXmark,
  faSpinner,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import { Toaster } from 'sonner'
import './index.css'
import '@/i18n'
import App from './App'
import { AuthProvider } from './auth/AuthContext'

const ti = 'h-4 w-4 shrink-0'

const routerBasename =
  import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')

/**
 * 未使用 `React.StrictMode`：StrictMode 在开发环境会双挂组件、重复执行 effect，
 * 导致 Network 与生产不一致。若需要 Strict 的检查能力，可改回包裹并接受开发时双请求。
 */
createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename={routerBasename}>
    <AuthProvider>
      <div className="h-full min-h-dvh min-h-[100dvh] w-full">
        <App />
      </div>
      <Toaster
        theme="dark"
        position="top-center"
        expand={false}
        richColors={false}
        closeButton
        icons={{
          success: <FontAwesomeIcon icon={faCircleCheck} className={`${ti} text-emerald-400`} />,
          error: <FontAwesomeIcon icon={faCircleXmark} className={`${ti} text-red-400`} />,
          warning: <FontAwesomeIcon icon={faTriangleExclamation} className={`${ti} text-amber-400`} />,
          info: <FontAwesomeIcon icon={faCircleInfo} className={`${ti} text-sky-300`} />,
          loading: <FontAwesomeIcon icon={faSpinner} spin className={`${ti} text-sky-300`} />,
        }}
        toastOptions={{
          duration: 4000,
          style: {
            marginTop: 'max(12px, env(safe-area-inset-top, 0px))',
          },
          classNames: {
            toast:
              '!rounded-xl !border !border-white/[0.1] !bg-surface-850 !pr-12 !text-zinc-100 !shadow-panel',
            title: '!text-zinc-100',
            description: '!text-zinc-400',
            icon: '!self-start !pt-0.5',
            success:
              '!border-emerald-500/50 !shadow-[0_0_28px_-8px_rgba(52,211,153,0.45)]',
            error: '!border-red-500/45 !shadow-[0_0_28px_-8px_rgba(239,68,68,0.28)]',
            warning: '!border-amber-500/45 !shadow-[0_0_28px_-8px_rgba(245,158,11,0.28)]',
            info: '!border-sky-400/50 !bg-surface-900/95 !shadow-[0_0_32px_-6px_rgba(56,189,248,0.45)]',
            default: '!border-zinc-500/35',
            loading:
              '!border-sky-400/55 !bg-surface-900/95 !shadow-[0_0_36px_-4px_rgba(56,189,248,0.5)]',
            actionButton:
              '!rounded-lg !bg-white !px-3 !py-1.5 !text-sm !font-medium !text-black',
            cancelButton: '!rounded-lg !bg-white/10 !text-zinc-200',
            closeButton:
              '!absolute !left-auto !right-2 !top-2 !z-[2] !m-0 !size-6 !shrink-0 !transform-none !border-0 !bg-white/5 !text-zinc-400 hover:!bg-white/10',
          },
        }}
      />
    </AuthProvider>
  </BrowserRouter>,
)
