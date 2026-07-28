/**
 * 开发环境下部分接口仍带 `user_id` 查询参数（OpenAPI 默认 dev 行为）。
 * 生产环境应依赖 Authorization，勿设置此变量。
 */
export function optionalDevUserId(): { user_id?: number } {
  const raw = import.meta.env.VITE_API_DEFAULT_USER_ID?.trim()
  if (!raw) return {}
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return {}
  return { user_id: n }
}
