import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/** 同步 <html lang>、document.title 与当前语言 */
export function I18nHtmlLang() {
  const { i18n, t } = useTranslation()

  useEffect(() => {
    const lng = i18n.language
    document.documentElement.lang = lng.startsWith('zh') ? 'zh-CN' : 'en'
    document.title = t('meta.title')
  }, [i18n.language, t])

  return null
}
