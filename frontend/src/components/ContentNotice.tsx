import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons'

type ContentNoticeProps = {
  children: ReactNode
  className?: string
  role?: 'note' | 'status' | 'region'
}

/**
 * 内容区顶部说明：深暖底 + 暗金边框 + 黄系图标与主文；次要说明可用 text-zinc-400，强调数值可用 strong。
 */
export function ContentNotice({ children, className = '', role }: ContentNoticeProps) {
  return (
    <div
      role={role}
      className={`flex w-full min-w-0 items-start gap-3 rounded-xl border border-[#45371c] bg-[#1c1917] px-4 py-3 ring-1 ring-inset ring-[#45371c]/40 ${className}`}
    >
      <div
        className="mt-0.5 flex w-8 shrink-0 justify-center text-[#eab308] md:w-9"
        aria-hidden
      >
        <FontAwesomeIcon icon={faCircleInfo} className="text-xl leading-none" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-[#eab308] [&>*]:m-0 [&_p+p]:mt-2 [&_a]:text-yellow-200 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-yellow-100 [&_strong]:font-semibold [&_strong]:text-[#22d3ee] [&_.text-notice-muted]:text-zinc-400">
        {children}
      </div>
    </div>
  )
}
