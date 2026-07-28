import type { InternalAxiosRequestConfig } from 'axios'
import i18n from '@/i18n'

const HEADER = 'Accept-Language'

/**
 * 与 Nexus 约定：`Accept-Language` 为 `zh` 或 `en`（与 i18n `zh` / `en` 对齐）。
 * 在每次请求拦截器内调用，随界面语言切换即时生效。
 */
export function currentAcceptLanguage(): 'zh' | 'en' {
  const lng = i18n.resolvedLanguage ?? i18n.language ?? 'zh'
  const base = String(lng).split('-')[0]?.toLowerCase() || 'zh'
  return base.startsWith('zh') ? 'zh' : 'en'
}

export function attachAcceptLanguageHeader(config: InternalAxiosRequestConfig): void {
  config.headers.set(HEADER, currentAcceptLanguage())
}
