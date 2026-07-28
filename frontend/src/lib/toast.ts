import { toast as sonnerToast, type ExternalToast } from 'sonner'

/**
 * 全局提示（Sonner，`main.tsx` 的 `<Toaster />` 统一样式）。
 *
 * 三种主类型（图标 + 描边/光晕不同）：
 * - `success` — 高亮绿（emerald）
 * - `error` — 红
 * - `warning` — 琥珀
 *
 * `info` — 天蓝描边/光晕（较醒目）；`loading` — 同系加载态（含旋转图标）。
 * `message` — 中性灰描边。
 */
export const notify = {
  success: (message: string, data?: ExternalToast) => sonnerToast.success(message, data),
  error: (message: string, data?: ExternalToast) => sonnerToast.error(message, data),
  info: (message: string, data?: ExternalToast) => sonnerToast.info(message, data),
  warning: (message: string, data?: ExternalToast) => sonnerToast.warning(message, data),
  loading: (message: string, data?: ExternalToast) => sonnerToast.loading(message, data),
  promise: sonnerToast.promise,
  dismiss: sonnerToast.dismiss,
  message: (message: string, data?: ExternalToast) => sonnerToast.message(message, data),
}
