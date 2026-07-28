import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchCurrentUser, updateCurrentUser } from '@/api/nexus/user'
import { NexusBizError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { notify } from '@/lib/toast'
import { safeRecord, safeString } from '@/lib/safe'

const pageWrap = 'mx-auto w-full min-h-0 max-w-3xl px-4 py-6 md:px-8 lg:py-8'

function parseProfile(raw: unknown): { name: string; email: string; avatarUrl: string } {
  const r = safeRecord(raw)
  const name = safeString(r.name ?? r.nickname ?? r.username).trim()
  const email = safeString(r.email).trim()
  const avatarUrl = safeString(r.avatarUrl ?? r.avatar ?? r.headImgUrl ?? r.headimgurl).trim()
  return { name, email, avatarUrl }
}

function validateName(name: string): string | null {
  const v = name.trim()
  if (!v) return 'required'
  if (v.length < 2) return 'tooShort'
  if (v.length > 32) return 'tooLong'
  return null
}

function validateEmail(email: string): string | null {
  const v = email.trim()
  if (!v) return 'required'
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  if (!ok) return 'invalid'
  return null
}

export function ProfilePage() {
  const { t } = useTranslation()
  const { refreshMe } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loadedName, setLoadedName] = useState('')
  const [loadedEmail, setLoadedEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [touched, setTouched] = useState<{ name: boolean; email: boolean }>({
    name: false,
    email: false,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const raw = await fetchCurrentUser()
      const p = parseProfile(raw)
      setName(p.name)
      setEmail(p.email)
      setAvatarUrl(p.avatarUrl)
      setLoadedName(p.name)
      setLoadedEmail(p.email)
    } catch (e) {
      const msg =
        e instanceof NexusBizError
          ? e.message
          : e instanceof Error
            ? e.message
            : t('console.profile.loadFail')
      notify.error(msg)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const nameErr = validateName(name)
  const emailErr = validateEmail(email)
  const canSubmit = !nameErr && !emailErr && !loading && !saving
  const dirty = name.trim() !== loadedName.trim() || email.trim() !== loadedEmail.trim()

  const nameErrText = useMemo(() => {
    if (!nameErr) return null
    if (nameErr === 'required') return t('console.profile.nameRequired')
    if (nameErr === 'tooShort') return t('console.profile.nameTooShort')
    return t('console.profile.nameTooLong')
  }, [nameErr, t])

  const emailErrText = useMemo(() => {
    if (!emailErr) return null
    if (emailErr === 'required') return t('console.profile.emailRequired')
    return t('console.profile.emailInvalid')
  }, [emailErr, t])

  function exitEditMode() {
    setEditing(false)
    setName(loadedName)
    setEmail(loadedEmail)
    setTouched({ name: false, email: false })
  }

  return (
    <div className={`${pageWrap} h-full min-h-0 overflow-y-auto scrollbar-surface`}>
      <div className="rounded-2xl border border-white/[0.08] bg-surface-850/80 p-5 shadow-panel md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-white/10">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.visibility = 'hidden'
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-zinc-500">
                  {(loadedName || name || '?').slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white md:text-xl">{t('console.profile.title')}</h2>
              <p className="mt-1 text-sm text-zinc-400">{t('console.profile.subtitle')}</p>
            </div>
          </div>
          {!editing ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => setEditing(true)}
              className="rounded-xl border border-white/[0.12] px-4 py-2.5 text-sm text-zinc-200 transition hover:border-white/[0.2] hover:text-white disabled:opacity-50"
            >
              {t('console.profile.edit')}
            </button>
          ) : null}
        </div>

        {!editing ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-white/[0.08] bg-surface-900/80 px-4 py-3">
              <p className="text-xs text-zinc-500">{t('console.profile.name')}</p>
              <p className="mt-1 text-sm text-zinc-100">{loadedName || '-'}</p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-surface-900/80 px-4 py-3">
              <p className="text-xs text-zinc-500">{t('console.profile.email')}</p>
              <p className="mt-1 text-sm text-zinc-100">{loadedEmail || '-'}</p>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-300">{t('console.profile.name')}</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((s) => ({ ...s, name: true }))}
                maxLength={32}
                className="w-full rounded-xl border border-white/[0.12] bg-surface-900 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-accent/30 placeholder:text-zinc-500 focus:ring-2"
                placeholder={t('console.profile.namePlaceholder')}
              />
              {touched.name && nameErrText ? (
                <p className="mt-1 text-xs text-red-400">{nameErrText}</p>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-300">{t('console.profile.email')}</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((s) => ({ ...s, email: true }))}
                className="w-full rounded-xl border border-white/[0.12] bg-surface-900 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-accent/30 placeholder:text-zinc-500 focus:ring-2"
                placeholder={t('console.profile.emailPlaceholder')}
              />
              {touched.email && emailErrText ? (
                <p className="mt-1 text-xs text-red-400">{emailErrText}</p>
              ) : null}
            </label>
          </div>
        )}

        {editing ? (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canSubmit || !dirty}
              onClick={() => {
                void (async () => {
                  setTouched({ name: true, email: true })
                  if (!canSubmit) return
                  setSaving(true)
                  try {
                    await updateCurrentUser({ name: name.trim(), email: email.trim() })
                    setLoadedName(name.trim())
                    setLoadedEmail(email.trim())
                    await refreshMe()
                    setEditing(false)
                    notify.success(t('console.profile.saveOk'))
                  } catch (e) {
                    const msg =
                      e instanceof NexusBizError
                        ? e.message
                        : e instanceof Error
                          ? e.message
                          : t('console.profile.saveFail')
                    notify.error(msg)
                  } finally {
                    setSaving(false)
                  }
                })()
              }}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? t('console.common.loading') : t('console.profile.save')}
            </button>
            <button
              type="button"
              disabled={loading || saving}
              onClick={exitEditMode}
              className="rounded-xl border border-white/[0.12] px-4 py-2.5 text-sm text-zinc-300 transition hover:border-white/[0.2] hover:text-white disabled:opacity-50"
            >
              {t('console.profile.cancel')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
