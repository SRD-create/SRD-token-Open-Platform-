/// <reference types="node" />
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig(({ mode }) => ({
  base: mode === 'development' ? '/' : '/nexus/',
  plugins: [react()],
  resolve: {
    alias: { '@': srcDir },
  },
  server: {
    // 手机与同 WiFi 下的电脑可通过局域网 IP 访问，例如 http://192.168.1.23:5173
    host: true,
    /**
     * Nexus 业务接口浏览器路径为 **`/nexus/api/*`**（与 OpenAPI 一致）。
     * 仍保留 `/api` → 上游 `/nexus/api` 的兼容代理，便于旧书签或临时配置。
     * 内网联调：设 `VITE_DEV_PROXY_TARGET=http://your-backend-ip:8001`（或 `http://your-backend-ip`）时，`/nexus/api`、`/api` 与 `/enterprise` 均转发到该地址。
     * 未设置时：默认与线上一致，转发到 **`https://your-domain.com`**（路径仍为 `/nexus/api/*` 等）。
     * **`/llm/*`**：OpenAI 兼容网关（如 `/llm/v1/chat/completions`），开发时与页面同源走代理，避免直连生产域名触发 CORS。
     */
    proxy: (() => {
      const unified = process.env.VITE_DEV_PROXY_TARGET?.trim()
      const defaultUpstream = 'https://your-domain.com'
      const apiTarget = unified || defaultUpstream
      const enterpriseTarget = unified || defaultUpstream
      /** `/api/foo` → 上游 `/nexus/api/foo` */
      const rewriteApiToNexus = (p: string) => {
        if (p === '/api' || p.startsWith('/api/')) return `/nexus${p}`
        return p
      }
      return {
        '/llm': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/nexus/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: rewriteApiToNexus,
        },
        '/enterprise': {
          target: enterpriseTarget,
          changeOrigin: true,
        },
      }
    })(),
  },
}))
