import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy } from '@fortawesome/free-solid-svg-icons'
import { fetchModelServicesPage } from '@/api/modelSquare'
import { ModelDetailModal } from '@/components/ModelDetailModal'
import { ModelSquareMarketCard } from '@/components/ModelSquareMarketCard'
import { mapRecordToModelItem, type ModelItem } from '@/modelSquare/modelItem'
import { useAuth } from '@/auth/useAuth'
import { copyTextToClipboard } from '@/lib/copyToClipboard'
import { notify } from '@/lib/toast'
import { useLandingSession } from '@/landing/LandingSessionContext'
import { scrollDocsMainToTop } from '@/lib/scrollDocsMain'
import { DocsFooterNav } from '@/pages/docs/DocsFooterNav'
import { useLlmOpenApiBase } from '@/hooks/useLlmOpenApiBase'

const apiDocsConsoleLinkClass =
  'font-medium text-accent-glow underline decoration-accent/40 underline-offset-2 hover:text-accent'

function ApiDocsConsoleLink({ children }: { children?: ReactNode }) {
  const { token } = useAuth()
  const { openLogin } = useLandingSession()
  if (token) {
    return (
      <Link to="/console/usage" className={apiDocsConsoleLinkClass}>
        {children}
      </Link>
    )
  }
  return (
    <button
      type="button"
      className={`${apiDocsConsoleLinkClass} cursor-pointer bg-transparent p-0 text-left font-inherit`}
      onClick={() => openLogin({ redirectTo: '/console/usage' })}
    >
      {children}
    </button>
  )
}

function CodePanel({
  label,
  code,
  copyLabel,
  copiedToast,
  failToast,
}: {
  label: string
  code: string
  copyLabel: string
  copiedToast: string
  failToast: string
}) {
  const copy = useCallback(async () => {
    const ok = await copyTextToClipboard(code)
    if (ok) notify.success(copiedToast)
    else notify.error(failToast)
  }, [code, copiedToast, failToast])

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950/80 ring-1 ring-inset ring-white/[0.04]">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2 md:px-4">
        <span className="font-mono text-xs text-zinc-500">{label}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-lg border border-white/[0.12] bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
        >
          {copyLabel}
        </button>
      </div>
      <pre className="max-h-[min(70vh,28rem)] overflow-x-auto overflow-y-auto p-3 text-[11px] leading-relaxed text-zinc-300 md:p-4 md:text-xs">
        <code>{code}</code>
      </pre>
    </div>
  )
}

type CodeExampleTab = 'curl' | 'python' | 'nodejs'

function ExampleTabBar({
  active,
  onChange,
  labels,
}: {
  active: CodeExampleTab
  onChange: (tab: CodeExampleTab) => void
  labels: Record<CodeExampleTab, string>
}) {
  return (
    <div className="flex gap-5 border-b border-white/[0.06]">
      {(['curl', 'python', 'nodejs'] as const).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={[
            'relative pb-2 text-xs font-medium transition md:text-sm',
            active === id ? 'text-accent-glow' : 'text-zinc-500 hover:text-zinc-300',
          ].join(' ')}
        >
          {labels[id]}
          {active === id ? (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-accent" aria-hidden />
          ) : null}
        </button>
      ))}
    </div>
  )
}

const API_DOCS_MODEL_SHOWCASE_SIZE = 3
const CHAT_EXAMPLE_MODEL_FALLBACK = 'MiniMax-M2.5-FP8-INT4-AWQ'

export function ApiDocsPage() {
  const { t } = useTranslation()
  const llmBase = useLlmOpenApiBase()
  const chatUrl = `${llmBase}/chat/completions`
  const embedUrl = `${llmBase}/embeddings`

  const [chatTab, setChatTab] = useState<CodeExampleTab>('curl')
  const [embedTab, setEmbedTab] = useState<CodeExampleTab>('curl')
  const [showcaseModels, setShowcaseModels] = useState<ModelItem[]>([])
  const [showcaseLoading, setShowcaseLoading] = useState(true)
  const [showcaseError, setShowcaseError] = useState(false)
  const [detailModel, setDetailModel] = useState<ModelItem | null>(null)
  const didScrollAfterShowcaseRef = useRef(false)

  const tabLabels = useMemo(
    () =>
      ({
        curl: t('apiDocs.chat.tabCurl'),
        python: t('apiDocs.chat.tabPython'),
        nodejs: t('apiDocs.chat.tabNode'),
      }) satisfies Record<CodeExampleTab, string>,
    [t],
  )

  const copyBaseUrl = useCallback(async () => {
    const ok = await copyTextToClipboard(llmBase)
    if (ok) notify.success(t('apiDocs.toast.copied'))
    else notify.error(t('apiDocs.toast.copyFail'))
  }, [llmBase, t])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setShowcaseLoading(true)
      setShowcaseError(false)
      try {
        const payload = await fetchModelServicesPage({
          pageNum: 1,
          pageSize: API_DOCS_MODEL_SHOWCASE_SIZE,
        })
        if (cancelled) return
        setShowcaseModels(payload.records.map((r) => mapRecordToModelItem(r, t)))
      } catch {
        if (!cancelled) {
          setShowcaseModels([])
          setShowcaseError(true)
          notify.error(t('models.loadListError'))
        }
      } finally {
        if (!cancelled) setShowcaseLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [t])

  /** 模型展示区异步替换骨架后，浏览器可能用 scroll anchoring 下移视口；首次加载完成后补一次置顶 */
  useLayoutEffect(() => {
    if (showcaseLoading) return
    if (didScrollAfterShowcaseRef.current) return
    didScrollAfterShowcaseRef.current = true
    scrollDocsMainToTop()
  }, [showcaseLoading])

  const modelId = showcaseModels[0]?.name ?? CHAT_EXAMPLE_MODEL_FALLBACK

  const chatBodies = useMemo(() => {
    const curl = `curl ${chatUrl} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $YOUR_API_KEY" \\
  -d '{
    "model": "${modelId}",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ],
    "stream": false
  }'`

    const python = `from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="${llmBase}",
)

resp = client.chat.completions.create(
    model="${modelId}",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"},
    ],
    stream=False,
)

print(resp.choices[0].message.content)`

    const nodejs = `const url = "${chatUrl}";

const body = {
  model: "${modelId}",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" },
  ],
  stream: false,
};

async function main() {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer YOUR_API_KEY",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("HTTP", res.status, text);
    process.exitCode = 1;
    return;
  }

  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});`

    return { curl, python, nodejs }
  }, [chatUrl, llmBase, modelId])

  const responseJson = useMemo(
    () =>
      `{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "${modelId}",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! How can I assist you today?"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 9,
    "completion_tokens": 12,
    "total_tokens": 21
  }
}`,
    [modelId],
  )

  const embedBodies = useMemo(() => {
    const embedModel = 'text-embedding-3-small'
    const embedInput = 'The food was delicious and the waiter...'

    const curl = `curl ${embedUrl} \\
  -H "Authorization: Bearer $YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "input": "${embedInput}",
    "model": "${embedModel}"
  }'`

    const python = `from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="${llmBase}",
)

resp = client.embeddings.create(
    model="${embedModel}",
    input="${embedInput}",
)

print(len(resp.data[0].embedding))`

    const nodejs = `const url = "${embedUrl}";

const body = {
  input: "${embedInput}",
  model: "${embedModel}",
};

async function main() {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer YOUR_API_KEY",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("HTTP", res.status, text);
    process.exitCode = 1;
    return;
  }

  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});`

    return { curl, python, nodejs }
  }, [embedUrl, llmBase])

  const th = 'px-3 py-2.5 text-left text-xs font-medium text-zinc-500 md:px-4 md:text-sm'
  const td = 'border-t border-white/[0.06] px-3 py-2.5 text-xs text-zinc-200 md:px-4 md:text-sm'

  return (
    <div className="relative min-h-0 w-full min-w-0 flex-1 pb-16 md:pb-20">
        <h1 className="sr-only">{t('apiDocs.title')}</h1>

        <section className="mb-12 md:mb-14">
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
            {t('apiDocs.firstCall.title')}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400 md:text-base">
            {t('apiDocs.firstCall.intro')}
          </p>
        </section>

        <section className="mb-12 md:mb-14">
          <h2 className="text-xl font-semibold text-white md:text-2xl">{t('apiDocs.basic.title')}</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08] bg-surface-850/50">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                  <th className={th}>PARAM</th>
                  <th className={th}>VALUE</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${td} font-mono text-zinc-400`}>base_url</td>
                  <td className={td}>
                    <button
                      type="button"
                      onClick={() => void copyBaseUrl()}
                      className="group flex w-full max-w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-transparent px-1 py-0.5 text-left transition hover:border-white/[0.08] hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      title={t('apiDocs.basic.copyBaseUrl')}
                      aria-label={t('apiDocs.basic.copyBaseUrlAria')}
                    >
                      <span className="min-w-0 break-all font-mono text-zinc-200">{llmBase}</span>
                      <FontAwesomeIcon
                        icon={faCopy}
                        className="h-3.5 w-3.5 shrink-0 text-zinc-500 transition group-hover:text-zinc-300"
                        aria-hidden
                      />
                    </button>
                  </td>
                </tr>
                <tr>
                  <td className={`${td} font-mono text-zinc-400`}>api_key</td>
                  <td className={td}>
                    <Trans
                      i18nKey="apiDocs.basic.apiKeyValue"
                      components={[<ApiDocsConsoleLink key="api-console" />]}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section
          className="mb-12 rounded-xl border border-white/[0.08] bg-surface-850/50 px-3 py-3 md:mb-14 md:px-4 md:py-4"
          role="note"
        >
          <p className="text-sm font-medium text-zinc-200">{t('apiDocs.compatTip.title')}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-400 md:text-sm">
            {t('apiDocs.compatTip.body')}
          </p>
        </section>

        <section className="mb-12 [overflow-anchor:none] md:mb-14">
          <h2 className="text-xl font-semibold text-white md:text-2xl">{t('apiDocs.models.title')}</h2>
          <p className="mt-2 text-sm text-zinc-400">{t('apiDocs.models.intro')}</p>
          {showcaseLoading ? (
            <div className="mt-6 flex min-h-[12rem] items-center justify-center rounded-2xl border border-white/[0.08] bg-zinc-950/40">
              <div
                className="h-9 w-9 rounded-full border-2 border-cyan-500/15 border-t-cyan-400 motion-safe:animate-spin"
                aria-hidden
              />
            </div>
          ) : showcaseError ? (
            <p className="mt-6 text-sm text-zinc-500">{t('models.loadListError')}</p>
          ) : showcaseModels.length === 0 ? (
            <p className="mt-6 text-sm text-zinc-500">{t('models.empty')}</p>
          ) : (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {showcaseModels.map((m) => (
                <ModelSquareMarketCard key={m.id} model={m} onOpenDetail={setDetailModel} />
              ))}
            </div>
          )}
        </section>

        <section className="mb-12 md:mb-14">
          <h2 className="text-xl font-semibold text-white md:text-2xl">{t('apiDocs.chat.title')}</h2>
          <p className="mt-2 text-sm text-zinc-400">{t('apiDocs.chat.intro')}</p>
          <div className="mt-5 space-y-4">
            <ExampleTabBar active={chatTab} onChange={setChatTab} labels={tabLabels} />
            <CodePanel
              label={chatTab}
              code={chatBodies[chatTab]}
              copyLabel={t('apiDocs.copy')}
              copiedToast={t('apiDocs.toast.copied')}
              failToast={t('apiDocs.toast.copyFail')}
            />
          </div>
        </section>

        <section className="mb-12 md:mb-14">
          <h2 className="text-xl font-semibold text-white md:text-2xl">{t('apiDocs.requestParams.title')}</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                  <th className={th}>{t('apiDocs.requestParams.colParam')}</th>
                  <th className={th}>{t('apiDocs.requestParams.colType')}</th>
                  <th className={th}>{t('apiDocs.requestParams.colRequired')}</th>
                  <th className={th}>{t('apiDocs.requestParams.colDesc')}</th>
                </tr>
              </thead>
              <tbody>
                {(['row1', 'row2', 'row3', 'row4', 'row5'] as const).map((row) => (
                  <tr key={row}>
                    <td className={`${td} font-mono text-zinc-400`}>{t(`apiDocs.requestParams.${row}.param`)}</td>
                    <td className={td}>{t(`apiDocs.requestParams.${row}.type`)}</td>
                    <td className={td}>{t(`apiDocs.requestParams.${row}.req`)}</td>
                    <td className={td}>{t(`apiDocs.requestParams.${row}.desc`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12 md:mb-14">
          <h2 className="text-xl font-semibold text-white md:text-2xl">{t('apiDocs.response.title')}</h2>
          <div className="mt-4">
            <CodePanel
              label="json"
              code={responseJson}
              copyLabel={t('apiDocs.copy')}
              copiedToast={t('apiDocs.toast.copied')}
              failToast={t('apiDocs.toast.copyFail')}
            />
          </div>
        </section>

        <section className="mb-12 md:mb-14">
          <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{t('apiDocs.embedding.title')}</h2>
          <p className="mt-2 text-sm text-zinc-400 md:text-base">{t('apiDocs.embedding.intro')}</p>
          <div className="mt-6 space-y-4">
            <ExampleTabBar active={embedTab} onChange={setEmbedTab} labels={tabLabels} />
            <CodePanel
              label={embedTab}
              code={embedBodies[embedTab]}
              copyLabel={t('apiDocs.copy')}
              copiedToast={t('apiDocs.toast.copied')}
              failToast={t('apiDocs.toast.copyFail')}
            />
          </div>
        </section>

        <section className="mb-12 md:mb-14">
          <h2 className="text-xl font-semibold text-white md:text-2xl">{t('apiDocs.errors.title')}</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="w-full min-w-[28rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                  <th className={th}>{t('apiDocs.errors.colCode')}</th>
                  <th className={th}>{t('apiDocs.errors.colType')}</th>
                  <th className={th}>{t('apiDocs.errors.colDesc')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${td} font-mono text-zinc-300`}>200</td>
                  <td className={td}>{t('apiDocs.errors.e200.type')}</td>
                  <td className={td}>{t('apiDocs.errors.e200.desc')}</td>
                </tr>
                <tr>
                  <td className={`${td} font-mono text-zinc-300`}>400</td>
                  <td className={td}>{t('apiDocs.errors.e400.type')}</td>
                  <td className={td}>{t('apiDocs.errors.e400.desc')}</td>
                </tr>
                <tr>
                  <td className={`${td} font-mono text-zinc-300`}>401</td>
                  <td className={td}>{t('apiDocs.errors.e401.type')}</td>
                  <td className={td}>{t('apiDocs.errors.e401.desc')}</td>
                </tr>
                <tr>
                  <td className={`${td} font-mono text-zinc-300`}>429</td>
                  <td className={td}>{t('apiDocs.errors.e429.type')}</td>
                  <td className={td}>{t('apiDocs.errors.e429.desc')}</td>
                </tr>
                <tr>
                  <td className={`${td} font-mono text-zinc-300`}>500</td>
                  <td className={td}>{t('apiDocs.errors.e500.type')}</td>
                  <td className={td}>{t('apiDocs.errors.e500.desc')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-white/[0.08] bg-surface-850/50 px-3 py-4 md:px-4 md:py-5">
          <h2 className="text-sm font-semibold text-zinc-200 md:text-base">{t('apiDocs.rateLimit.heading')}</h2>
          <p className="mt-2 text-sm text-zinc-400">{t('apiDocs.rateLimit.intro')}</p>
          <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-zinc-400">
            <li>{t('apiDocs.rateLimit.b1')}</li>
            <li>{t('apiDocs.rateLimit.b2')}</li>
            <li>{t('apiDocs.rateLimit.b3')}</li>
          </ul>
          <p className="mt-4 text-xs text-zinc-500 md:text-sm">{t('apiDocs.rateLimit.footer')}</p>
        </section>

        <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-zinc-600 md:mt-10">
          {t('apiDocs.legalDisclaimer')}
        </p>
      <DocsFooterNav />
      <ModelDetailModal model={detailModel} onClose={() => setDetailModel(null)} />
    </div>
  )
}
