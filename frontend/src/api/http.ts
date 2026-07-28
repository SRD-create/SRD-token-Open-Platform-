import axios from 'axios'
import { attachAcceptLanguageHeader } from '@/api/acceptLanguage'
import { resolveHttpBaseUrl } from '@/api/apiOrigin'
import { mockAxiosAdapter } from '@/api/mockAdapter'
import { AITOKEN_DEMO_TOKEN_LS_KEY, handleSessionExpiredAxios401 } from '@/api/sessionExpired401'
import { messageFromAxiosData } from '@/api/response'

/** 仅在 `VITE_USE_MOCK=true` 时启用本地假数据，避免误连生产 */
const useMock = import.meta.env.VITE_USE_MOCK === 'true'

export const TOKEN_HEADER = 'Authorization'

const baseURL = resolveHttpBaseUrl()

export const http = axios.create({
  baseURL,
  timeout: 30_000,
  adapter: useMock ? mockAxiosAdapter : undefined,
  headers: {
    Accept: 'application/json',
  },
})

http.interceptors.request.use((config) => {
  attachAcceptLanguageHeader(config)
  const token = localStorage.getItem(AITOKEN_DEMO_TOKEN_LS_KEY)
  if (token) {
    config.headers.set(TOKEN_HEADER, `Bearer ${token}`)
  }
  return config
})

http.interceptors.response.use(
  (res) => res,
  (err: unknown) => {
    if (axios.isAxiosError(err)) {
      handleSessionExpiredAxios401(err)
      const parsed = messageFromAxiosData(err.response?.data)
      if (parsed) {
        err.message = parsed
      }
    }
    return Promise.reject(err)
  },
)
