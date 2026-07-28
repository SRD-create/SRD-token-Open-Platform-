import type { ReactNode } from 'react'

/** 子页面可向 AppShell 顶栏右侧注入操作区（如「创建」按钮） */
export type AppShellOutletContext = {
  setHeaderRight: (node: ReactNode | null) => void
}
