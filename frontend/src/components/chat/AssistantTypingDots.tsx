/**
 * 助手回复前等待态：三点错落跳动（流式 / 非流式共用）。
 * `label` 供读屏，视觉上仅显示圆点动效。
 */
export function AssistantTypingDots({ label }: { label: string }) {
  const dot = 'ai-chat-typing-dot inline-block size-[5px] shrink-0 rounded-full bg-zinc-400/95'
  return (
    <div
      className="flex min-h-[1.1em] items-center gap-1 py-0.5"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <span className={dot} aria-hidden />
      <span className={`${dot} ai-chat-typing-dot-delay`} aria-hidden />
      <span className={`${dot} ai-chat-typing-dot-delay-2`} aria-hidden />
    </div>
  )
}
