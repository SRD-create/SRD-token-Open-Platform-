import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useId } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowUp,
  faArrowsRotate,
  faCheck,
  faChevronDown,
  faCopy,
  faPen,
  faRobot,
  faRotateRight,
  faStop,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { listApiKeys, listModelsForApiKey } from '@/api/nexus/apiKeys'
import {
  mapApiKeyItemToRow,
  pickApiKeyListItemSecret,
  pickModelNamesFromApiKeyModelsList,
} from '@/api/mappers/apiKey'
import {
  pickChatCompletionUsageFromStreamSsePayloads,
  pickChatCompletionUsage,
  safeChatAssistantContent,
  type ChatCompletionUsagePayload,
} from '@/api/mappers/console'
import { useAuth } from '@/auth/useAuth'
import { useLlmOpenApiBase } from '@/hooks/useLlmOpenApiBase'
import { AssistantTypingDots } from '@/components/chat/AssistantTypingDots'
import { ChatMessageMarkdown } from '@/components/chat/ChatMessageMarkdown'
import {
  clearAiChatSession,
  loadAiChatSession,
  saveAiChatSession,
} from '@/lib/aiChatSessionCache'
import { copyTextToClipboard } from '@/lib/copyToClipboard'
import { notify } from '@/lib/toast'

const QUICK_PROMPT_KEYS = ['q1', 'q2'] as const

/** 底部输入框多行时的最大高度（px），超出则内部滚动，避免整页被撑满 */
const COMPOSER_TEXTAREA_MAX_PX = 160

type Msg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** 助手消息：非流式来自 `usage`；流式来自 SSE 倒数第二条（含 `usage` 的 JSON） */
  usage?: ChatCompletionUsagePayload
}

type UserInlineEditState = { userMsgId: string; draft: string }

type KeyOption = { id: string; label: string; secret: string }

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') return true
  return e instanceof Error && e.name === 'AbortError'
}

type AnchorBox = { top: number; left: number; width: number; maxHeight: number }

/**
 * 替代原生 `<select>`：在带 overflow/transform 的壳层里，Chrome 会把系统下拉画错位；
 * 用 portal + fixed 锚在触发按钮正下方。
 */
function AiChatModelSelect({
  value,
  options,
  disabled,
  onChange,
  labelledBy,
  emptyLabel,
}: {
  value: string
  options: readonly string[]
  disabled: boolean
  onChange: (next: string) => void
  labelledBy: string
  emptyLabel: string
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<AnchorBox>({ top: 0, left: 0, width: 0, maxHeight: 280 })
  const anchorRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)

  const updateBox = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 4
    const pad = 8
    const maxHeight = Math.max(120, window.innerHeight - r.bottom - gap - pad)
    setBox({ top: r.bottom + gap, left: r.left, width: r.width, maxHeight })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updateBox()
    const onWin = () => updateBox()
    window.addEventListener('scroll', onWin, true)
    window.addEventListener('resize', onWin)
    return () => {
      window.removeEventListener('scroll', onWin, true)
      window.removeEventListener('resize', onWin)
    }
  }, [open, updateBox])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (anchorRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const triggerClass =
    'box-border inline-flex h-10 w-[11.5rem] max-w-[min(100%,18rem)] shrink-0 items-center justify-between gap-2 rounded-lg border border-white/[0.1] bg-surface-900 px-3 text-left text-sm leading-5 text-zinc-100 outline-none ring-accent/30 focus-visible:ring-2 sm:w-52 disabled:cursor-not-allowed disabled:opacity-50'

  const hasOptions = options.length > 0
  const triggerText = !hasOptions ? '—' : value || emptyLabel
  const triggerMuted = hasOptions && !value

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled || !hasOptions}
        id="ai-chat-model"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelledBy}
        className={triggerClass}
        onClick={() => {
          if (disabled || !hasOptions) return
          setOpen((o) => !o)
        }}
      >
        <span
          className={[
            'min-w-0 flex-1 truncate font-mono text-[13px]',
            triggerMuted ? 'text-zinc-500' : 'text-zinc-100',
          ].join(' ')}
        >
          {triggerText}
        </span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`h-3 w-3 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open &&
        hasOptions &&
        createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-labelledby={labelledBy}
            className="z-[300] overflow-y-auto rounded-lg border border-white/[0.12] bg-surface-900 py-1 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65)] scrollbar-surface"
            style={{
              position: 'fixed',
              top: box.top,
              left: box.left,
              width: box.width,
              maxHeight: box.maxHeight,
            }}
          >
            {options.map((m) => {
              const selected = m === value
              return (
                <li key={m} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={[
                      'flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[13px] leading-snug transition',
                      selected
                        ? 'bg-accent/15 text-violet-100'
                        : 'text-zinc-200 hover:bg-white/[0.06] hover:text-white',
                    ].join(' ')}
                    onClick={() => {
                      onChange(m)
                      setOpen(false)
                    }}
                  >
                    <span className="flex w-4 shrink-0 justify-center" aria-hidden>
                      {selected ? <FontAwesomeIcon icon={faCheck} className="h-3 w-3 text-violet-300" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{m}</span>
                  </button>
                </li>
              )
            })}
          </ul>,
          document.body,
        )}
    </>
  )
}

export function AiChatPage() {
  const { t, i18n } = useTranslation()
  const { token } = useAuth()
  const llmBase = useLlmOpenApiBase()
  const [pat, setPat] = useState('')
  const [model, setModel] = useState('')
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [keyOptions, setKeyOptions] = useState<KeyOption[]>([])
  const [selectedKeyId, setSelectedKeyId] = useState('')
  const [streaming, setStreaming] = useState(true)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [composerMultiline, setComposerMultiline] = useState(false)
  const [sending, setSending] = useState(false)
  const [apiKeysLoading, setApiKeysLoading] = useState(true)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [skipEmptyIntro, setSkipEmptyIntro] = useState(false)
  const [userInlineEdit, setUserInlineEdit] = useState<UserInlineEditState | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  /** 用于在「生成结束」时聚焦底部输入框，避免与首屏挂载混淆 */
  const prevSendingRef = useRef(false)
  const userInlineEditTextareaRef = useRef<HTMLTextAreaElement>(null)
  const threadScrollRef = useRef<HTMLDivElement>(null)
  /** 为 false 时不在每次流式更新后强制滚底，避免用户上翻阅读时被拽回底部 */
  const threadStickToBottomRef = useRef(true)
  const llmAbortRef = useRef<AbortController | null>(null)
  const streamBufRef = useRef('')
  const streamShownLenRef = useRef(0)
  const streamAssistantIdRef = useRef<string | null>(null)
  const streamReaderActiveRef = useRef(false)
  const streamPumpRafRef = useRef<number | null>(null)
  const cachedSessionRef = useRef<ReturnType<typeof loadAiChatSession>>(null)
  const keyCacheAppliedRef = useRef(false)

  const accountKey = token ?? 'guest'
  const modelFieldLabelId = useId()

  const stopStreamPump = useCallback(() => {
    if (streamPumpRafRef.current != null) {
      cancelAnimationFrame(streamPumpRafRef.current)
      streamPumpRafRef.current = null
    }
    streamAssistantIdRef.current = null
    streamReaderActiveRef.current = false
    streamBufRef.current = ''
    streamShownLenRef.current = 0
  }, [])

  const runStreamPump = useCallback(() => {
    streamPumpRafRef.current = null
    const id = streamAssistantIdRef.current
    if (!id) return
    const buf = streamBufRef.current
    let shown = streamShownLenRef.current
    if (shown < buf.length) {
      const behind = buf.length - shown
      const step =
        behind <= 1
          ? 1
          : behind <= 6
            ? 2
            : behind <= 24
              ? Math.max(2, Math.ceil(behind / 4))
              : Math.max(4, Math.ceil(behind / 8))
      shown = Math.min(buf.length, shown + step)
      streamShownLenRef.current = shown
      const display = buf.slice(0, shown)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id && m.role === 'assistant' ? { ...m, content: display } : m,
        ),
      )
    }
    if (streamShownLenRef.current < streamBufRef.current.length) {
      streamPumpRafRef.current = requestAnimationFrame(runStreamPump)
    }
  }, [])

  const scheduleStreamPump = useCallback(() => {
    if (streamPumpRafRef.current == null) {
      streamPumpRafRef.current = requestAnimationFrame(runStreamPump)
    }
  }, [runStreamPump])

  const localeTag = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'

  /** 同标签页内恢复会话（sessionStorage）；换账号/登出时按 accountKey 隔离 */
  useLayoutEffect(() => {
    keyCacheAppliedRef.current = false
    cachedSessionRef.current = loadAiChatSession(accountKey)
    const c = cachedSessionRef.current
    if (c) {
      setMessages(c.messages as Msg[])
      if (c.model) setModel(c.model)
      setStreaming(c.streaming)
      setInput(c.input ?? '')
    } else {
      setMessages([])
      setInput('')
      setStreaming(true)
    }
  }, [accountKey])

  useEffect(() => {
    if (keyCacheAppliedRef.current) return
    if (!keyOptions.length) return
    keyCacheAppliedRef.current = true
    const c = cachedSessionRef.current
    if (c?.selectedKeyId) {
      const match = keyOptions.find((k) => k.id === c.selectedKeyId)
      if (match) {
        setSelectedKeyId(match.id)
        setPat(match.secret)
      }
    }
  }, [keyOptions])

  useEffect(() => {
    const id = window.setTimeout(() => {
      saveAiChatSession(accountKey, {
        v: 1,
        messages,
        model,
        selectedKeyId,
        streaming,
        input,
      })
    }, 400)
    return () => window.clearTimeout(id)
  }, [accountKey, messages, model, selectedKeyId, streaming, input])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!token) {
        setModelOptions(['MiniMax-M2.5-FP8-INT4-AWQ'])
        setModel((m) => (m ? m : 'MiniMax-M2.5-FP8-INT4-AWQ'))
        setKeyOptions([])
        setSelectedKeyId('')
        setPat('')
        setApiKeysLoading(false)
        setModelsLoading(false)
        return
      }
      setApiKeysLoading(true)
      setKeyOptions([])
      setSelectedKeyId('')
      setPat('')
      setModelOptions([])
      try {
        const keyList = await listApiKeys({ limit: 100 }).catch(() => {
          notify.error(t('console.aiChat.apiKeyLoadFail'))
          return { items: [] as unknown[], total: 0 }
        })
        if (cancelled) return

        const listed: KeyOption[] = []
        for (const it of keyList.items) {
          const row = mapApiKeyItemToRow(it, localeTag)
          if (!row) continue
          const secret = pickApiKeyListItemSecret(it)
          if (!secret) continue
          listed.push({
            id: `k-${row.id}`,
            label: row.name,
            secret,
          })
        }
        const seen = new Set<string>()
        const uniqueListed = listed.filter((o) => {
          if (seen.has(o.secret)) return false
          seen.add(o.secret)
          return true
        })
        const opts = uniqueListed
        let selId = ''
        let patVal = ''
        if (opts.length) {
          selId = opts[0]!.id
          patVal = opts[0]!.secret
        }
        setKeyOptions(opts)
        setSelectedKeyId(selId)
        setPat(patVal)
      } finally {
        if (!cancelled) {
          setApiKeysLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, localeTag, t])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!token) {
        return
      }
      if (!pat.trim()) {
        setModelOptions([])
        setModel('')
        setModelsLoading(false)
        return
      }
      setModelsLoading(true)
      try {
        const { items } = await listModelsForApiKey(pat)
        if (cancelled) return
        const names = pickModelNamesFromApiKeyModelsList(items)
        if (names.length) {
          setModelOptions(names)
          setModel((m) => (m && names.includes(m) ? m : names[0]!))
        } else {
          setModelOptions([])
          setModel('')
        }
      } catch {
        if (!cancelled) {
          notify.error(t('console.aiChat.modelListLoadFail'))
          setModelOptions([])
          setModel('')
        }
      } finally {
        if (!cancelled) {
          setModelsLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pat, token, t])

  useEffect(() => {
    if (messages.length > 0) setSkipEmptyIntro(true)
  }, [messages.length])

  useEffect(() => () => stopStreamPump(), [stopStreamPump])

  const onThreadScroll = useCallback(() => {
    const el = threadScrollRef.current
    if (!el) return
    const margin = 100
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    threadStickToBottomRef.current = dist <= margin
  }, [])

  useLayoutEffect(() => {
    const el = threadScrollRef.current
    if (!el) return
    if (threadStickToBottomRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'auto' })
    }
  }, [messages])

  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    const maxPx = COMPOSER_TEXTAREA_MAX_PX
    /** 单行空态高度（px）；`lineHeight === height` 让占位符在 Chrome 内垂直居中 */
    const emptySingleH = 36
    if (input === '') {
      el.style.lineHeight = `${emptySingleH}px`
      el.style.height = `${emptySingleH}px`
      el.style.maxHeight = `${maxPx}px`
      setComposerMultiline(false)
      return
    }
    el.style.lineHeight = ''
    el.style.height = 'auto'
    el.style.maxHeight = `${maxPx}px`
    const raw = Math.min(el.scrollHeight, maxPx)
    /** 与空态单行同高，避免有内容时 `scrollHeight` 偏小把框压扁 */
    const minLine = emptySingleH
    const h = Math.max(raw, minLine)
    el.style.height = `${h}px`
    const multiline = h > 44
    setComposerMultiline(multiline)
    /** 圆角「药丸」单行时：行高与框高一致，文字垂直居中（与空态占位符同理） */
    el.style.lineHeight = multiline ? '' : `${h}px`
  }, [input])

  const quickPrompts = useMemo(
    () =>
      QUICK_PROMPT_KEYS.map((key) => ({
        key,
        text: t(`console.aiChat.quickPrompts.${key}`),
      })),
    [t],
  )

  const reset = useCallback(() => {
    llmAbortRef.current?.abort()
    stopStreamPump()
    threadStickToBottomRef.current = true
    setUserInlineEdit(null)
    setMessages([])
    setInput('')
    clearAiChatSession(accountKey)
    notify.message(t('console.aiChat.resetToast'))
  }, [accountKey, stopStreamPump, t])

  const sendChatCore = useCallback(
    async (history: Msg[], signal: AbortSignal) => {
      const sk = pat.trim()
      if (!sk) {
        return null
      }
      const base = llmBase.replace(/\/$/, '')
      const url = `${base}/chat/completions`
      const bodyMessages = history.map((m) => ({ role: m.role, content: m.content }))
      let res: Response
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sk}`,
          },
          body: JSON.stringify({
            model,
            messages: bodyMessages,
            stream: false,
          }),
          signal,
        })
      } catch (e) {
        if (isAbortError(e)) throw e
        throw e instanceof Error ? e : new Error(String(e))
      }
      const text = await res.text()
      if (!res.ok) {
        throw new Error(text || `HTTP ${res.status}`)
      }
      let data: unknown
      try {
        data = JSON.parse(text) as unknown
      } catch {
        throw new Error(t('console.aiChat.badJson'))
      }
      const content = safeChatAssistantContent(data)
      if (!content) throw new Error(t('console.aiChat.emptyAssistant'))
      if (!content.trim()) throw new Error(t('console.aiChat.emptyAssistant'))
      const usage = pickChatCompletionUsage(data)
      return { content, usage }
    },
    [llmBase, model, pat, t],
  )

  const stopLlmRequest = useCallback(() => {
    llmAbortRef.current?.abort()
  }, [])

  const streamChatCore = useCallback(
    async (history: Msg[], assistantMsgId: string, signal: AbortSignal) => {
      const sk = pat.trim()
      if (!sk) {
        throw new Error(t('console.aiChat.patRequired'))
      }
      const base = llmBase.replace(/\/$/, '')
      const url = `${base}/chat/completions`
      const bodyMessages = history.map((m) => ({ role: m.role, content: m.content }))
      let res: Response
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sk}`,
          },
          body: JSON.stringify({
            model,
            messages: bodyMessages,
            stream: true,
          }),
          signal,
        })
      } catch (e) {
        if (isAbortError(e)) {
          streamReaderActiveRef.current = false
          stopStreamPump()
          notify.message(t('console.aiChat.stopped'))
          return
        }
        throw e instanceof Error ? e : new Error(String(e))
      }
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || `HTTP ${res.status}`)
      }
      const reader = res.body?.getReader()
      if (!reader) {
        throw new Error(t('console.aiChat.sendFail'))
      }

      streamBufRef.current = ''
      streamShownLenRef.current = 0
      streamAssistantIdRef.current = assistantMsgId
      streamReaderActiveRef.current = true
      scheduleStreamPump()

      const decoder = new TextDecoder()
      let carry = ''
      /** 每条 `data:` 解析后的 JSON，用于结束后从倒数第二条取 `usage` */
      const sseParsedPayloads: unknown[] = []
      const flushLine = (line: string) => {
        const trimmed = line.replace(/\r$/, '').trim()
        if (!trimmed || trimmed.startsWith(':')) return
        if (!trimmed.startsWith('data:')) return
        const payload = trimmed.slice(5).trimStart()
        if (payload === '[DONE]') return
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[]
          }
          sseParsedPayloads.push(json)
          const piece = json.choices?.[0]?.delta?.content
          if (typeof piece === 'string' && piece.length > 0) {
            streamBufRef.current += piece
            scheduleStreamPump()
          }
        } catch {
          /* ignore non-JSON SSE payloads */
        }
      }
      try {
        while (true) {
          let chunk: ReadableStreamReadResult<Uint8Array>
          try {
            chunk = await reader.read()
          } catch (readErr) {
            if (signal.aborted || isAbortError(readErr)) {
              break
            }
            throw readErr
          }
          const { done, value } = chunk
          if (done) break
          if (signal.aborted) break
          carry += decoder.decode(value, { stream: true })
          const parts = carry.split('\n')
          carry = parts.pop() ?? ''
          for (const part of parts) {
            flushLine(part)
          }
        }
        if (!signal.aborted && carry.trim()) {
          flushLine(carry)
        }
      } finally {
        streamReaderActiveRef.current = false
        scheduleStreamPump()
        try {
          await reader.cancel()
        } catch {
          /* ignore */
        }
      }

      if (signal.aborted) {
        const partial = streamBufRef.current
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId && m.role === 'assistant' ? { ...m, content: partial } : m,
          ),
        )
        stopStreamPump()
        notify.message(t('console.aiChat.stopped'))
        return
      }

      if (!streamBufRef.current.trim()) {
        throw new Error(t('console.aiChat.emptyAssistant'))
      }
      const full = streamBufRef.current
      const usage = pickChatCompletionUsageFromStreamSsePayloads(sseParsedPayloads)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId && m.role === 'assistant'
            ? { ...m, content: full, ...(usage ? { usage } : {}) }
            : m,
        ),
      )
      stopStreamPump()
    },
    [llmBase, model, pat, scheduleStreamPump, stopStreamPump, t],
  )

  const sendUserTurn = useCallback(
    async (hist: Msg[], ac: AbortController) => {
      const userMsg = hist[hist.length - 1]
      if (!userMsg || userMsg.role !== 'user') return
      if (!pat.trim()) {
        notify.error(t('console.aiChat.patRequired'))
        return
      }
      setSending(true)
      if (streaming) {
        const assistantId = `a-${Date.now()}`
        setMessages([...hist, { id: assistantId, role: 'assistant', content: '' }])
        try {
          await streamChatCore(hist, assistantId, ac.signal)
        } catch (e) {
          stopStreamPump()
          if (!isAbortError(e)) {
            setMessages((m) => m.filter((x) => x.id !== userMsg.id && x.id !== assistantId))
            const msg = e instanceof Error ? e.message : t('console.aiChat.sendFail')
            notify.error(msg)
          }
        } finally {
          setSending(false)
          if (llmAbortRef.current === ac) llmAbortRef.current = null
        }
        return
      }
      const assistantId = `a-${Date.now()}`
      setMessages([...hist, { id: assistantId, role: 'assistant', content: '' }])
      try {
        const reply = await sendChatCore(hist, ac.signal)
        if (!reply) {
          setMessages((m) => m.filter((x) => x.id !== userMsg.id && x.id !== assistantId))
          return
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && m.role === 'assistant'
              ? {
                  ...m,
                  content: reply.content,
                  ...(reply.usage ? { usage: reply.usage } : {}),
                }
              : m,
          ),
        )
      } catch (e) {
        if (isAbortError(e)) {
          notify.message(t('console.aiChat.stopped'))
          setMessages((m) => m.filter((x) => x.id !== assistantId))
          return
        }
        setMessages((m) => m.filter((x) => x.id !== userMsg.id && x.id !== assistantId))
        const msg = e instanceof Error ? e.message : t('console.aiChat.sendFail')
        notify.error(msg)
      } finally {
        setSending(false)
        if (llmAbortRef.current === ac) llmAbortRef.current = null
      }
    },
    [pat, sendChatCore, stopStreamPump, streamChatCore, streaming, t],
  )

  const sendText = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text) return
      if (!token) {
        return
      }
      threadStickToBottomRef.current = true
      llmAbortRef.current?.abort()
      const ac = new AbortController()
      llmAbortRef.current = ac
      const userMsg: Msg = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
      }
      const hist = [...messages, userMsg]
      await sendUserTurn(hist, ac)
    },
    [messages, sendUserTurn, token],
  )

  const submitUserInlineEdit = useCallback(async () => {
    if (!userInlineEdit || !token) return
    const text = userInlineEdit.draft.trim()
    if (!text) return
    const idx = messages.findIndex((m) => m.id === userInlineEdit.userMsgId && m.role === 'user')
    if (idx < 0) {
      setUserInlineEdit(null)
      return
    }
    const userMsg: Msg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    }
    const hist = [...messages.slice(0, idx), userMsg]
    setUserInlineEdit(null)
    threadStickToBottomRef.current = true
    llmAbortRef.current?.abort()
    const ac = new AbortController()
    llmAbortRef.current = ac
    await sendUserTurn(hist, ac)
  }, [messages, sendUserTurn, token, userInlineEdit])

  const copyAssistantReply = useCallback(
    async (content: string) => {
      const text = content.trim()
      if (!text) return
      const ok = await copyTextToClipboard(text)
      if (ok) notify.success(t('console.aiChat.copiedReply'))
      else notify.error(t('console.aiChat.copyReplyFail'))
    },
    [t],
  )

  const copyUserMessage = useCallback(
    async (content: string) => {
      const text = content.trim()
      if (!text) return
      const ok = await copyTextToClipboard(text)
      if (ok) notify.success(t('console.aiChat.copiedReply'))
      else notify.error(t('console.aiChat.copyReplyFail'))
    },
    [t],
  )

  const openUserInlineEdit = useCallback(
    (userId: string) => {
      if (sending) return
      const m = messages.find((x) => x.id === userId && x.role === 'user')
      if (!m) return
      setUserInlineEdit({ userMsgId: userId, draft: m.content })
    },
    [messages, sending],
  )

  const cancelUserInlineEdit = useCallback(() => {
    setUserInlineEdit(null)
  }, [])

  useLayoutEffect(() => {
    if (!userInlineEdit) return
    const el = userInlineEditTextareaRef.current
    if (!el) return
    el.focus()
    const len = userInlineEdit.draft.length
    try {
      el.setSelectionRange(len, len)
    } catch {
      /* ignore */
    }
  }, [userInlineEdit?.userMsgId])

  useEffect(() => {
    const ended = prevSendingRef.current && !sending && userInlineEdit == null
    prevSendingRef.current = sending
    if (!ended) return
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [sending, userInlineEdit])

  const regenerateAssistantReply = useCallback(
    async (assistantId: string) => {
      if (!token || sending) return
      if (!pat.trim()) {
        notify.error(t('console.aiChat.patRequired'))
        return
      }
      const idx = messages.findIndex((m) => m.id === assistantId && m.role === 'assistant')
      if (idx < 1) return
      const pairUser = messages[idx - 1]
      if (!pairUser || pairUser.role !== 'user') return
      const history = messages.slice(0, idx)
      llmAbortRef.current?.abort()
      const ac = new AbortController()
      llmAbortRef.current = ac
      threadStickToBottomRef.current = true
      setSending(true)
      if (streaming) {
        const newAid = `a-${Date.now()}`
        setMessages((prev) => [...prev.slice(0, idx), { id: newAid, role: 'assistant', content: '' }])
        try {
          await streamChatCore(history, newAid, ac.signal)
        } catch (e) {
          stopStreamPump()
          if (!isAbortError(e)) {
            setMessages((prev) => prev.filter((x) => x.id !== newAid))
            const msg = e instanceof Error ? e.message : t('console.aiChat.sendFail')
            notify.error(msg)
          }
        } finally {
          setSending(false)
          if (llmAbortRef.current === ac) llmAbortRef.current = null
        }
        return
      }
      const prevAssistant = messages[idx]!
      const newAid = `a-${Date.now()}`
      setMessages((prev) => [...prev.slice(0, idx), { id: newAid, role: 'assistant', content: '' }])
      try {
        const reply = await sendChatCore(history, ac.signal)
        if (!reply) {
          setMessages((prev) => [...prev.slice(0, idx), prevAssistant])
          return
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === newAid && m.role === 'assistant'
              ? {
                  ...m,
                  content: reply.content,
                  ...(reply.usage ? { usage: reply.usage } : {}),
                }
              : m,
          ),
        )
      } catch (e) {
        if (!isAbortError(e)) {
          const msg = e instanceof Error ? e.message : t('console.aiChat.sendFail')
          notify.error(msg)
        } else {
          notify.message(t('console.aiChat.stopped'))
        }
        setMessages((prev) => [...prev.slice(0, idx), prevAssistant])
      } finally {
        setSending(false)
        if (llmAbortRef.current === ac) llmAbortRef.current = null
      }
    },
    [messages, pat, sendChatCore, sending, stopStreamPump, streamChatCore, streaming, token, t],
  )

  const send = useCallback(() => {
    if (userInlineEdit) return
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    void sendText(text)
  }, [input, sendText, sending, userInlineEdit])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (userInlineEdit) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const onInlineEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelUserInlineEdit()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submitUserInlineEdit()
    }
  }

  const lastMsg = messages[messages.length - 1]
  const showStreamCaret =
    Boolean(sending && lastMsg?.role === 'assistant' && streaming)

  const lastUserMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === 'user') return messages[i]!.id
    }
    return null
  }, [messages])

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden px-4 pb-6 pt-4 md:px-8 md:pt-6">
      <div className="mb-3 shrink-0 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <div className="shrink-0 px-1 text-xs text-zinc-400 sm:px-2">
            <div className="inline-flex flex-wrap items-center gap-2 sm:gap-3">
              <label htmlFor="ai-chat-api-key" className="shrink-0 leading-none text-zinc-500">
                {t('console.aiChat.patLabel')}
              </label>
              <select
                id="ai-chat-api-key"
                value={selectedKeyId}
                disabled={apiKeysLoading}
                onChange={(e) => {
                  const id = e.target.value
                  setSelectedKeyId(id)
                  const opt = keyOptions.find((o) => o.id === id)
                  setPat(opt?.secret ?? '')
                }}
                className="box-border h-10 w-[13.5rem] max-w-[min(100%,20rem)] rounded-md border border-white/[0.1] bg-surface-950 px-3 text-sm leading-5 text-zinc-100 outline-none focus:border-accent/40 sm:w-60"
              >
                <option value="" disabled>
                  {t('console.aiChat.apiKeySelectPlaceholder')}
                </option>
                {keyOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:shrink-0">
            <div className="inline-flex items-center gap-2 text-xs leading-none text-zinc-500">
              <span id={modelFieldLabelId} className="shrink-0">
                {t('console.aiChat.labelModel')}
              </span>
              <AiChatModelSelect
                value={model}
                options={modelOptions}
                disabled={apiKeysLoading || modelsLoading}
                onChange={setModel}
                labelledBy={modelFieldLabelId}
                emptyLabel={t('console.aiChat.modelSelectPlaceholder')}
              />
            </div>
            <button
              type="button"
              onClick={() => setStreaming((s) => !s)}
              disabled={sending}
              aria-pressed={streaming}
              title={t('console.aiChat.streamHint')}
              className={[
                'box-border inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium leading-none transition sm:px-3',
                streaming
                  ? 'cursor-pointer border-sky-400/40 bg-sky-500/10 text-sky-100 hover:border-sky-400/55'
                  : 'cursor-pointer border-white/[0.1] text-zinc-300 hover:border-white/[0.18] hover:text-white',
                sending ? 'pointer-events-none opacity-50' : '',
              ].join(' ')}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${streaming ? 'bg-sky-400' : 'bg-zinc-500'}`}
                aria-hidden
              />
              {t('console.aiChat.streaming')}
            </button>
            <button
              type="button"
              onClick={reset}
              className="box-border inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-accent/15 px-3 text-xs font-medium leading-none text-accent-glow ring-1 ring-accent/30 transition hover:bg-accent/25 sm:px-3.5"
            >
              <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3" />
              {t('console.aiChat.reset')}
            </button>
          </div>
        </div>
      </div>

      <div
        ref={threadScrollRef}
        onScroll={onThreadScroll}
        className="scrollbar-surface min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] rounded-2xl py-5 md:py-6"
      >
        {messages.length === 0 ? (
          <div
            className={[
              'flex min-h-full flex-col items-center justify-center px-4 py-8 text-center',
              !skipEmptyIntro ? 'ai-chat-empty-enter' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/25 to-indigo-600/20 ring-1 ring-inset ring-violet-400/35">
              <FontAwesomeIcon icon={faRobot} className="h-8 w-8 text-violet-200" />
            </div>
            <h2 className="mt-6 max-w-xl bg-gradient-to-r from-violet-200 via-sky-300 to-cyan-200 bg-clip-text text-2xl font-semibold tracking-tight text-transparent md:text-3xl">
              {t('console.aiChat.emptyTitle')}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-100 md:text-base">
              {t('console.aiChat.emptySubtitle')}
            </p>
            <div className="mt-6 flex max-w-2xl flex-wrap justify-center gap-1.5">
              {quickPrompts.map((q) => (
                <button
                  key={q.key}
                  type="button"
                  title={q.text}
                  disabled={sending || userInlineEdit !== null}
                  onClick={() => void sendText(q.text)}
                  className="inline-flex max-w-full items-center rounded-md border border-white/[0.1] bg-white/[0.04] px-2.5 py-0.5 text-xs font-medium leading-snug text-zinc-300 transition hover:border-violet-400/35 hover:bg-violet-500/[0.12] hover:text-zinc-50 disabled:pointer-events-none disabled:opacity-40"
                >
                  <span className="truncate">{q.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 md:px-5">
            {messages.map((msg) => {
              const isUser = msg.role === 'user'
              const isLastAssistant = !isUser && msg.id === lastMsg?.id
              const regenBusy = sending && isLastAssistant
              const showUserReEdit = isUser && lastUserMessageId === msg.id
              /** 流式 / 非流式：在首字到达前统一用占位，避免空 Markdown + 光标闪一下再出字 */
              const showAssistantThinking =
                !isUser && sending && isLastAssistant && !msg.content.trim()
              return (
                <li
                  key={msg.id}
                  className={`flex w-full ${
                    isUser && userInlineEdit?.userMsgId === msg.id
                      ? ''
                      : isUser
                        ? 'justify-end'
                        : 'flex-col items-start gap-1'
                  }`}
                >
                  {isUser && userInlineEdit?.userMsgId === msg.id ? (
                    <div className="mx-auto w-full max-w-3xl shrink-0">
                      <div className="flex min-h-[3rem] items-end gap-2 rounded-2xl border border-accent/35 bg-accent/[0.14] px-2 py-2 ring-1 ring-accent/25 md:gap-2.5 md:px-3">
                        <button
                          type="button"
                          onClick={cancelUserInlineEdit}
                          disabled={sending}
                          title={t('console.aiChat.inlineEditCancel')}
                          aria-label={t('console.aiChat.inlineEditCancel')}
                          className="mb-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40"
                        >
                          <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
                        </button>
                        <textarea
                          ref={userInlineEditTextareaRef}
                          value={userInlineEdit.draft}
                          onChange={(e) =>
                            setUserInlineEdit((s) => (s ? { ...s, draft: e.target.value } : null))
                          }
                          onKeyDown={onInlineEditKeyDown}
                          disabled={sending}
                          rows={3}
                          className="box-border min-h-[4.5rem] w-0 min-w-0 flex-1 resize-y rounded-xl border border-white/[0.12] bg-surface-900/85 px-3 py-2 text-sm leading-relaxed text-zinc-100 outline-none ring-0 transition focus:border-accent/40 focus:ring-2 focus:ring-accent/25 disabled:opacity-50"
                        />
                        <button
                          type="button"
                          disabled={sending || !userInlineEdit.draft.trim()}
                          onClick={() => void submitUserInlineEdit()}
                          title={t('console.aiChat.inlineEditSubmit')}
                          aria-label={t('console.aiChat.inlineEditSubmit')}
                          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-zinc-900 shadow-md transition hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-40"
                        >
                          <FontAwesomeIcon icon={faArrowUp} className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : isUser ? (
                    <div className="group flex max-w-[min(100%,90%)] flex-col items-end shrink-0">
                      <div className="rounded-[1.15rem] rounded-br-md bg-zinc-800/85 px-4 py-2.5 text-[0.9375rem] leading-relaxed text-zinc-200 ring-1 ring-white/[0.07]">
                        {/*
                          用户消息用纯文本 + pre-wrap，避免 ReactMarkdown 多块级 DOM 导致手动复制时夹带大量换行；
                          复制按钮仍用 msg.content，行为一致。
                        */}
                        <div className="whitespace-pre-wrap break-words text-left">
                          {msg.content}
                        </div>
                      </div>
                      <div
                        className={[
                          '-mt-1.5 flex w-full max-w-full items-center justify-end gap-0.5 pt-1.5 pr-0.5',
                          'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
                          'pointer-events-none group-hover:pointer-events-auto',
                        ].join(' ')}
                      >
                        <button
                          type="button"
                          disabled={!msg.content.trim()}
                          title={t('console.aiChat.copyUserMessage')}
                          aria-label={t('console.aiChat.copyUserMessage')}
                          onClick={() => void copyUserMessage(msg.content)}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-30"
                        >
                          <FontAwesomeIcon icon={faCopy} className="h-3.5 w-3.5" />
                        </button>
                        {showUserReEdit ? (
                          <button
                            type="button"
                            disabled={sending || userInlineEdit !== null}
                            title={t('console.aiChat.reEditUserMessage')}
                            aria-label={t('console.aiChat.reEditUserMessage')}
                            onClick={() => openUserInlineEdit(msg.id)}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-30"
                          >
                            <FontAwesomeIcon icon={faPen} className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        className={[
                          'max-w-[min(100%,90%)] text-[0.9375rem] leading-relaxed',
                          'rounded-[1.15rem] rounded-bl-md bg-zinc-800/85 px-4 py-2.5 text-zinc-200 ring-1 ring-white/[0.07]',
                        ].join(' ')}
                      >
                        {showAssistantThinking ? (
                          <AssistantTypingDots label={t('console.aiChat.thinkingPlaceholder')} />
                        ) : (
                          <>
                            <ChatMessageMarkdown content={msg.content} />
                            {showStreamCaret && isLastAssistant && msg.content.trim() ? (
                              <span
                                className="mt-1 inline-block h-[1.1em] w-px animate-pulse bg-violet-300/90 align-middle"
                                aria-hidden
                              />
                            ) : null}
                          </>
                        )}
                      </div>
                      <div className="flex max-w-[min(100%,90%)] flex-wrap items-center gap-x-2 gap-y-1 pl-0.5">
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            disabled={!msg.content.trim()}
                            title={t('console.aiChat.copyReply')}
                            aria-label={t('console.aiChat.copyReply')}
                            onClick={() => void copyAssistantReply(msg.content)}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-30"
                          >
                            <FontAwesomeIcon icon={faCopy} className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={regenBusy}
                            title={t('console.aiChat.regenerateReply')}
                            aria-label={t('console.aiChat.regenerateReply')}
                            onClick={() => void regenerateAssistantReply(msg.id)}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-30"
                          >
                            <FontAwesomeIcon icon={faArrowsRotate} className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {msg.usage ? (
                          <p
                            className="text-[11px] tabular-nums leading-snug text-zinc-500 sm:text-xs"
                            title={t('console.aiChat.usageFooterTitle')}
                          >
                            {t('console.aiChat.usageFooter', {
                              prompt: msg.usage.promptTokens.toLocaleString(localeTag),
                              completion: msg.usage.completionTokens.toLocaleString(localeTag),
                              total: msg.usage.totalTokens.toLocaleString(localeTag),
                            })}
                          </p>
                        ) : null}
                      </div>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 pt-3">
        <div
          className={[
            'mx-auto flex min-h-[2.5rem] max-w-3xl gap-2 border border-sky-400/35 bg-surface-900/90 shadow-[0_0_0_1px_rgba(56,189,248,0.12),0_8px_36px_-12px_rgba(34,211,238,0.22)] transition-[border-color,box-shadow,border-radius] focus-within:border-sky-400/55 focus-within:shadow-[0_0_0_1px_rgba(103,232,249,0.35),0_12px_48px_-10px_rgba(34,211,238,0.38)]',
            composerMultiline
              ? 'rounded-2xl px-3 py-2.5 md:px-4'
              : 'rounded-full px-3.5 py-1 md:pl-4',
            composerMultiline ? 'items-end' : 'items-center',
          ].join(' ')}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              userInlineEdit
                ? t('console.aiChat.placeholderComposerWhileEditing')
                : t('console.aiChat.placeholderInput')
            }
            rows={1}
            disabled={sending || userInlineEdit !== null}
            style={{ maxHeight: `${COMPOSER_TEXTAREA_MAX_PX}px` }}
            className={[
              'box-border min-h-0 min-w-0 flex-1 resize-none overflow-x-hidden overflow-y-auto border-0 bg-transparent pr-1 text-sm text-zinc-100 outline-none ring-0 placeholder:text-zinc-500 focus:ring-0 disabled:opacity-50',
              input === ''
                ? 'py-0 leading-[36px]'
                : 'py-0 leading-relaxed [&:not(:placeholder-shown)]:leading-relaxed',
            ].join(' ')}
          />
          <button
            type="button"
            disabled={!sending && (!input.trim() || userInlineEdit !== null)}
            onClick={sending ? stopLlmRequest : send}
            title={sending ? t('console.aiChat.stopGeneration') : t('console.common.send')}
            aria-label={sending ? t('console.aiChat.stopGeneration') : t('console.common.send')}
            className={[
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-md transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
              sending
                ? 'bg-zinc-700 text-zinc-100 ring-1 ring-white/15 hover:bg-zinc-600'
                : 'bg-white text-zinc-900 hover:bg-zinc-100 hover:shadow-lg',
            ].join(' ')}
          >
            {sending ? (
              <FontAwesomeIcon icon={faStop} className="h-3 w-3" />
            ) : (
              <FontAwesomeIcon icon={faArrowUp} className="h-3.5 w-3.5 text-zinc-800" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
