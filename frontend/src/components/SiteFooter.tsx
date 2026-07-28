type SiteFooterProps = {
  /** 登录页等全屏场景可去掉顶部分割线 */
  borderless?: boolean
  className?: string
}

export function SiteFooter({ borderless, className = '' }: SiteFooterProps) {
  return (
    <footer
      className={[
        'shrink-0 px-4 py-3 text-center',
        borderless
          ? 'bg-transparent'
          : 'border-t border-white/[0.06] bg-surface-950/60 backdrop-blur-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <p className="text-[11px] leading-relaxed text-zinc-500 sm:text-xs">
        南京斯锐德科技有限公司 | Copyright © 2026 AIToken 智能算力开放平台. All rights reserved.
      </p>
    </footer>
  )
}
