import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchCurrentUser, fetchInvitedUsers } from '@/api/nexus/user'
import { formatMoneyishDisplay, pickAccountCommissionYuan } from '@/api/mappers/console'
import { NexusBizError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { copyTextToClipboard } from '@/lib/copyToClipboard'
import { safeRecord, safeString } from '@/lib/safe'
import { notify } from '@/lib/toast'

const pageWrap =
  'mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-6 overflow-y-auto px-4 py-6 scrollbar-surface md:px-8 lg:py-8'

/**
 * 邀请落地页（与后端约定）：`?invite_code=` 取自 `GET /user/me` 的 `invite_code`。
 * Base 须带尾斜杠，生成 `.../nexus/?invite_code=`，避免 `.../nexus?invite` 命中 nginx `location = /nexus` 的 301
 * 在旧配置未带 `$is_args$args` 时丢查询串。
 */
const INVITE_NEXUS_BASE = 'https://your-domain.com/nexus/'

type InvitedUserRow = {
  rowKey: string
  name: string
  inviteStatus: string
  rewardAmount: string
  invitedAtRaw: string
}

function pickInvitedRow(item: unknown, index: number): InvitedUserRow {
  const r = safeRecord(item)
  const invitee = safeRecord(r.invitee)
  const name =
    safeString(r.name) ||
    safeString(invitee.name) ||
    safeString(r.invited_email ?? r.email ?? r.invitee_email ?? r.account) ||
    '—'
  const inviteStatus = safeString(r.invite_status ?? r.status ?? r.state ?? '—')
  const rewardAmount = formatMoneyishDisplay(
    r.reward_amount ?? r.rewardAmount ?? r.amount ?? r.reward ?? r.commission,
  )
  const invitedAtRaw = safeString(r.invited_at ?? r.created_at ?? '')
  const rowKey = safeString(r.id ?? r.invite_id) || `${name}-${index}`
  return { rowKey, name, inviteStatus, rewardAmount, invitedAtRaw }
}

function formatInvitedAtDisplay(iso: string, locale: string): string {
  const t = iso.trim()
  if (!t) return '—'
  const ms = Date.parse(t)
  if (!Number.isFinite(ms)) return t
  return new Date(ms).toLocaleString(locale)
}

/** 后端枚举 → 文案；未收录的状态原样展示 */
function formatInviteStatusLabel(
  raw: string,
  t: (key: string, options?: { defaultValue?: string }) => string,
): string {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === '—') return trimmed || '—'
  const code = trimmed.toUpperCase()
  return t(`console.invitations.inviteStatus.${code}`, { defaultValue: trimmed })
}

export function InvitationPage() {
  const { t, i18n } = useTranslation()
  const { token } = useAuth()
  const localeTag = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'
  /** `GET /user/me` 原始字段：邀请码、佣金余额等与邀请页相关的展示均从此读取 */
  const [meProfile, setMeProfile] = useState<Record<string, unknown>>({})
  const [invited, setInvited] = useState<InvitedUserRow[]>([])
  const [loading, setLoading] = useState(true)

  /** 佣金在部分环境挂在根级，部分挂在 `account` 下；与 `/account/balance` 解析规则对齐 */
  const invitationCommissionYuan = useMemo(() => {
    const r = safeRecord(meProfile)
    const acc = safeRecord(r.account)
    return pickAccountCommissionYuan({ ...r, ...acc })
  }, [meProfile])

  const commissionMoneyFmt = useMemo(
    () =>
      new Intl.NumberFormat(localeTag, {
        style: 'currency',
        currency: 'CNY',
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      }),
    [localeTag],
  )

  const inviteRefUrl = useMemo(() => {
    const c = safeString(meProfile.invite_code ?? meProfile.inviteCode).trim()
    if (!c) return ''
    return `${INVITE_NEXUS_BASE}?invite_code=${encodeURIComponent(c)}`
  }, [meProfile])

  const load = useCallback(async () => {
    if (!token) {
      setMeProfile({})
      setInvited([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [meRaw, u] = await Promise.all([
        fetchCurrentUser(),
        fetchInvitedUsers({ limit: 100, offset: 0 }),
      ])
      setMeProfile(safeRecord(meRaw))
      setInvited(u.items.map((it, i) => pickInvitedRow(it, i)))
    } catch (e) {
      setMeProfile({})
      setInvited([])
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('console.invitations.loadFail')
      notify.error(msg)
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => {
    void load()
  }, [load])

  const copyInviteRefUrl = useCallback(async () => {
    if (!inviteRefUrl) {
      notify.error(t('console.invitations.noCode'))
      return
    }
    const text = t('console.invitations.copyShareMessage', { url: inviteRefUrl })
    const ok = await copyTextToClipboard(text)
    if (ok) notify.success(t('partners.tools.toastCopied'))
    else notify.error(t('partners.tools.toastCopyFail'))
  }, [inviteRefUrl, t])

  return (
    <div className={pageWrap}>
      <div className="shrink-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-850/80 p-5 shadow-panel md:p-6">
        <p className="text-sm text-zinc-500">{t('partners.tools.balanceLabel')}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          {loading ? '…' : commissionMoneyFmt.format(invitationCommissionYuan)}
        </p>
      </div>

      <div className="shrink-0 rounded-2xl border border-white/[0.08] bg-surface-850/80 p-5 md:p-6">
        <h3 className="text-sm font-medium text-zinc-400">{t('console.invitations.inviteTitle')}</h3>
        {loading ? (
          <p className="mt-3 text-sm text-zinc-500">{t('console.common.loading')}</p>
        ) : inviteRefUrl ? (
          <button
            type="button"
            onClick={() => void copyInviteRefUrl()}
            className="mt-3 block w-full cursor-pointer break-all text-left text-sm leading-relaxed text-sky-400 underline decoration-sky-400/50 underline-offset-2 transition hover:text-sky-300 hover:decoration-sky-300"
          >
            {inviteRefUrl}
          </button>
        ) : (
          <p className="mt-3 font-mono text-lg text-zinc-500">—</p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/[0.08] bg-surface-850/80 p-5 shadow-panel md:p-6">
        <h3 className="shrink-0 text-sm font-medium text-zinc-400">{t('console.invitations.invitedList')}</h3>
        <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-xl border border-white/[0.06] bg-surface-900/20">
          <div className="scrollbar-surface flex h-full max-h-full min-h-0 flex-col overflow-auto overscroll-contain [scrollbar-gutter:stable]">
            {loading || invited.length === 0 ? (
              <>
                <table className="w-full min-w-[36rem] shrink-0 border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-[1] border-b border-white/[0.08] bg-surface-850/95 backdrop-blur-sm">
                    <tr>
                      <th className="px-4 py-3 font-medium text-zinc-400">{t('console.invitations.colName')}</th>
                      <th className="px-4 py-3 font-medium text-zinc-400">
                        {t('console.invitations.colInviteStatus')}
                      </th>
                      <th className="px-4 py-3 font-medium text-zinc-400">
                        {t('console.invitations.colRewardAmount')}
                      </th>
                      <th className="px-4 py-3 font-medium text-zinc-400">{t('console.invitations.colInvitedAt')}</th>
                    </tr>
                  </thead>
                </table>
                <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 text-sm text-zinc-500">
                  {loading ? t('console.common.loading') : t('console.invitations.emptyInvited')}
                </div>
              </>
            ) : (
              <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-[1] border-b border-white/[0.08] bg-surface-850/95 backdrop-blur-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium text-zinc-400">{t('console.invitations.colName')}</th>
                    <th className="px-4 py-3 font-medium text-zinc-400">
                      {t('console.invitations.colInviteStatus')}
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-400">
                      {t('console.invitations.colRewardAmount')}
                    </th>
                    <th className="px-4 py-3 font-medium text-zinc-400">{t('console.invitations.colInvitedAt')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {invited.map((row) => (
                    <tr key={row.rowKey} className="align-middle">
                      <td className="max-w-[min(14rem,40vw)] px-4 py-3">
                        <p className="truncate font-medium text-zinc-100" title={row.name}>
                          {row.name}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {formatInviteStatusLabel(row.inviteStatus, t)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-zinc-300">
                        {row.rewardAmount === '—' ? '—' : `¥${row.rewardAmount}`}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                        {formatInvitedAtDisplay(row.invitedAtRaw, i18n.language)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
