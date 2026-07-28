# 文档中心（/docs）说明

## 侧栏导航顺序

与 `src/pages/docs/DocsLayout.tsx` 中 `DOC_NAV` 一致：

1. **API 文档** — `/docs`（`ApiDocsPage`，首次调用、示例、限流等）
2. **自研底座** — `/docs/self-built`
3. **硬核支撑** — `/docs/hardcore`
4. **极致性价比** — `/docs/cost-performance`
5. **代理加盟规则** — `/docs/partner-rules`

以上第 2–4 项对应首页三张能力卡，正文来自 `docsFeature.selfBuilt` / `hardcore` / `costPerf`（`zh.json` / `en.json`）。

## 正文与 i18n

- **组件**：`FeatureConceptDocPage`（`src/pages/docs/FeatureConceptDocPage.tsx`），按 `topic` 读取 `docsFeature.<topic>.*`（`title`、`intro`、`s1`–`s4`）。
- **当前 topic**：`selfBuilt` | `hardcore` | `costPerf`；另有 **`privacy`** 仅路由保留（见下），**不出现在侧栏**。

## 兼容旧链接（301 等价）

`src/App.tsx` 内对旧路径使用 `<Navigate replace />`：

| 旧路径 | 新路径 |
|--------|--------|
| `/docs/unified` | `/docs/self-built` |
| `/docs/latency` | `/docs/hardcore` |
| `/docs/pricing` | `/docs/cost-performance` |

## 页脚「隐私条款」

- 路由仍为 **`/docs/privacy`**，仍渲染 `FeatureConceptDocPage topic="privacy"`，文案键 **`docsFeature.privacy`**。
- 该页**不在侧栏**列出；首页页脚 `privacyTerms` 仍指向 `/docs/privacy`。
- **底部上一篇**：指向 **极致性价比**（`/docs/cost-performance`）；无「下一篇」。

## 底部上一篇 / 下一篇

- **实现**：`DocsFooterNav`（`src/pages/docs/DocsFooterNav.tsx`）+ 顺序表 `src/pages/docs/docsNavFlow.ts` 中 `DOCS_READING_ORDER` 与 `getDocsSequentialNeighbors`。
- **挂载页面**：`ApiDocsPage`、`FeatureConceptDocPage`、`PartnerRulesDocPage` 底部。
- **阅读顺序**：API 文档 → 自研底座 → 硬核支撑 → 极致性价比 → 代理加盟规则。首页与 API 文档首屏均可沿底部链接顺序阅读。

## 无障碍

- 底部导航容器 `aria-label` 使用 `docsLayout.seqNavAria`。
