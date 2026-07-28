/** 与 {@link AuthContext} 中假微信登录写入的 token 前缀一致；`refreshMe` 见此前缀则不调 `/user/me`。 */
export const MOCK_WECHAT_SESSION_TOKEN_PREFIX = 'mock-wechat-local-' as const

export function isMockWechatSessionToken(token: string | null): boolean {
  return Boolean(token?.startsWith(MOCK_WECHAT_SESSION_TOKEN_PREFIX))
}
