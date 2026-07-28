import { useCallback, useEffect, useRef, useState } from 'react'
import type { AxiosError } from 'axios'
import { isSessionExpiredAxiosError } from '@/api/sessionExpired401'
import { notify } from '@/lib/toast'

type State<T> = {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

export function useAxiosData<T>(fetcher: () => Promise<T>): State<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reloadRef = useRef<() => Promise<void>>(async () => {})

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      setData(result)
    } catch (e) {
      if (isSessionExpiredAxiosError(e)) {
        return
      }
      const ax = e as AxiosError<{ message?: string }>
      const msg =
        safeErrMessage(ax?.response?.data) ||
        safeErrMessage(ax?.message) ||
        '请求失败'
      setError(msg)
      setData(null)
      notify.error(msg, {
        duration: 6000,
        action: {
          label: '重试',
          onClick: () => {
            void reloadRef.current()
          },
        },
      })
    } finally {
      setLoading(false)
    }
  }, [fetcher])

  reloadRef.current = reload

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, loading, error, reload }
}

function safeErrMessage(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null && 'message' in v) {
    const m = (v as { message?: unknown }).message
    return typeof m === 'string' ? m : null
  }
  return null
}
