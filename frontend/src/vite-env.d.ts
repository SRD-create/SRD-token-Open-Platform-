/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Nexus 主接口浏览器前缀，默认等价于 **`/nexus/api`**（与 OpenAPI `/nexus/api/*` 一致）。
   * 填 `/api` 时会自动规范为 `/nexus/api`；生产子路径部署时见 `resolveHttpBaseUrl()`。
   */
  readonly VITE_API_BASE_URL: string
  /** 仅当值为 `'true'` 时使用本地 mock，其余情况走真实网络请求 */
  readonly VITE_USE_MOCK: string
  /**
   * 开发联调：部分接口 OpenAPI 仍带 `user_id` 查询参数时，可填数字（如 `1`）。
   * 生产环境应依赖登录态，勿配置此项。
   */
  readonly VITE_API_DEFAULT_USER_ID?: string
  /**
   * 本地 `yarn dev` 时代理目标：若设置，则 `/api`、`/nexus/api` 与 `/enterprise` 均转发到该地址（例如内网 `http://your-backend-ip:8001`）。
   * 未设置时：默认转发到 **`https://your-domain.com`**（与生产接口同源网关，路径仍为 `/nexus/api/*`）。
   */
  readonly VITE_DEV_PROXY_TARGET?: string
  /** Nexus 业务 API 的 OpenAPI / Swagger 地址（文档页外链等）；见 `resolveNexusOpenApiDocsUrl()` */
  readonly VITE_DOCS_URL?: string
  /** 为 `true` 时微信登录不调后端/微信，仅本地假 token + 假昵称（见 `applyMockWechatLogin`） */
  readonly VITE_MOCK_WECHAT_LOGIN?: string
  /**
   * 文档页 / AI 会话等大模型 `fetch` 的 base：`GET /config/llm-server` 成功时以接口为准；
   * 仅当该请求失败或未返回可解析字段时使用此项或内置默认。
   * 本地 `yarn dev` 时：若为 `https://…/llm/v1` 形态，会被改写为同源 **`/llm/v1`** 并由 Vite **`/llm` 代理**转发，避免 CORS。
   */
  readonly VITE_LLM_OPENAPI_BASE?: string
  /**
   * 扫码打开的 H5 等外链使用的「公网可访问」站点根，如 `http://192.168.1.8:5173`。
   * 不设时回退为 `window.location.origin`（本地 localhost 会导致手机扫码无法打开）。
   */
  readonly VITE_PUBLIC_APP_ORIGIN?: string
  /**
   * 仅佣金提现「确认收款」二维码中的页面域名；本地 `yarn dev` 可填线上根地址（如 `https://your-domain.com`），
   * 使手机打开已部署的 `/nexus/wechat-confirm`，而控制台仍用 localhost。未设置时与 `VITE_PUBLIC_APP_ORIGIN` 相同回退链。
   */
  readonly VITE_WECHAT_CONFIRM_QR_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
