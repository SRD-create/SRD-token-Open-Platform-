import { useEffect } from 'react'
import { notify } from '@/lib/toast'

/**
 * 兼容旧用法：不再渲染横幅，改为弹出 toast。
 * 若与 `useAxiosData` 同时使用，可能重复提示；新代码请直接 `notify.error`。
 */
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  useEffect(() => {
    if (!message) return
    notify.error(message, {
      duration: 6000,
      ...(onRetry
        ? {
            action: {
              label: '重试',
              onClick: () => {
                void onRetry()
              },
            },
          }
        : {}),
    })
  }, [message, onRetry])

  return null
}
