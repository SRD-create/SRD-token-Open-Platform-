/**
 * 与 `LandingHeader` 主行一致（`max-w-7xl` + 水平 padding），
 * 落地导航各内容页（除控制台）共用，左右边距与顶栏对齐。
 */
/**
 * 与 `LandingHeader` 主行一致。
 * 桌面端 `pr` 仅保留安全区，使右侧控件与正文右缘与视口对齐（无额外「空白条」）。
 */
export const landingContentShellClass =
  'mx-auto w-full max-w-7xl min-w-0 pl-2.5 pr-2 sm:pl-4 sm:pr-3 md:pl-8 md:pr-[env(safe-area-inset-right,0px)]'

/**
 * 文档 `/docs` 外层：与「联系我们」等内容页相同，使用 {@link landingContentShellClass}（`max-w-7xl` + 与顶栏一致的左右 padding）。
 * 保留此导出名为历史引用兼容，值与内容壳一致。
 */
export const landingDocsFullWidthShellClass = landingContentShellClass

/** 文档主栏内正文列：较窄可读宽度，靠主栏左侧；水平外边距由外层内容壳承担。 */
export const docsMainReadingColumnClass = 'ml-0 mr-auto w-full max-w-4xl min-w-0'

/** 与 `HomePage` 首屏大标题容器上内边距一致 */
export const landingHeroPaddingTopClass = 'pt-14 md:pt-20'

/** 与 `ModelSquarePage` 的 `pageWrap` 顶距一致：`py-*` 的 pt + `lg:pt-10` */
export const landingModelSquarePaddingTopClass = 'pt-4 sm:pt-5 md:pt-6 lg:pt-10'

/**
 * 文档侧栏 `position:sticky` 的 `top`：与首屏一致 = 顶栏实测高度 + 与 `landingModelSquarePaddingTopClass` 相同的顶距。
 * 依赖 `LandingLayout` 根节点上的 `--landing-header-offset`（px）。
 */
export const landingDocsSidebarStickyTopClass =
  'top-[calc(var(--landing-header-offset,72px)+1rem)] sm:top-[calc(var(--landing-header-offset,72px)+1.25rem)] md:top-[calc(var(--landing-header-offset,72px)+1.5rem)] lg:top-[calc(var(--landing-header-offset,72px)+2.5rem)]'

/**
 * 与 `LandingHeader` 中「公告 / 登录」胶囊一致：`h-9` + `text-xs` → `sm:text-sm`。
 * 供落地子页（联系、加盟页脚等）按钮与顶栏视觉对齐。
 */
export const landingPillPrimaryClass =
  'inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-accent px-3 text-xs font-medium text-white shadow-glow transition hover:bg-accent-dim sm:px-4 sm:text-sm'

export const landingPillOutlineClass =
  'inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] px-3 text-xs font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white sm:px-4 sm:text-sm'
