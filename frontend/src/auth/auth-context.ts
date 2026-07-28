import { createContext } from 'react'

export type MePayload = {
  id?: unknown
  nickname?: unknown
  avatarUrl?: unknown
  /** `GET /user/me` 的 `is_admin`：后台管理入口与路由权限 */
  isAdmin?: boolean
  /**
   * 由 `GET /user/me` 的 `agent_level` 映射后的**单一正整数**（见 `mapUserToMePayload`）。
   * 接口里可能是数字，也可能是 `{ id, level, description, ... }` 对象；前端不直接比较原始 JSON。
   * 未加盟时为 `null` / 省略。
   */
  agentLevel?: number | null
  /** `agent_level` 为对象时，套餐展示名（如 `description`） */
  agentLevelDescription?: string | null
  /** `GET /user/me`：是否已绑定微信服务号（佣金提现等能力依赖） */
  wechatServiceBound?: boolean | null
}

export type AuthState = {
  token: string | null
  me: MePayload | null
  meLoading: boolean
  /** 微信回调带回的 code，交给后端换 token */
  loginWithWeChatCode: (code: string) => Promise<void>
  /**
   * `VITE_MOCK_WECHAT_LOGIN=true` 时由登录按钮调用：不调微信/换票接口，仅本地假会话。
   * @see {@link isMockWechatSessionToken}
   */
  applyMockWechatLogin: () => void
  /** 开发调试：直接应用既有 token（如线上已登录用户 token） */
  applyTokenLogin: (token: string) => void
  logout: () => void
  refreshMe: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
