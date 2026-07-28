/** sessionStorage：从「立即加盟」打开登录后，经整页跳转（微信 OAuth）回到站点时仍自动打开加盟弹窗 */
export const PARTNER_JOIN_PENDING_KEY = 'aitoken_pending_partner_join'

/** 登录前选中的加盟档位金额（元），与 {@link PARTNER_JOIN_PENDING_KEY} 配合使用；多档同价时不可靠，以 {@link PARTNER_JOIN_TIER_ID_KEY} 为准。 */
export const PARTNER_JOIN_TIER_YUAN_KEY = 'aitoken_pending_partner_join_tier_yuan'

/** 登录前选中的加盟套餐 id（`GET /agents/levels` 的 `id` / `agent_level_id`），与 {@link PARTNER_JOIN_PENDING_KEY} 配合使用 */
export const PARTNER_JOIN_TIER_ID_KEY = 'aitoken_pending_partner_join_tier_id'

/** 弹窗登录成功后由 `afterAuth` 写入，`/partners` 在拿到 token 后打开加盟付款弹窗 */
export const PARTNER_JOIN_OPEN_AFTER_LOGIN_KEY = 'aitoken_partner_join_open_after_login'
