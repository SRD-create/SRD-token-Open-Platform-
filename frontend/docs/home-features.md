# 首页「能力卡片」区块说明

## 概述

落地页 `#features` 区块展示 **三张**能力卡片，用于概括平台在 **自研、算力底座、成本** 上的定位。文案以中文为准；英文见 `src/locales/en.json` 中 `home.features.*`。

## 文案对照（中文）

| i18n key | 标题 | 描述 |
|----------|------|------|
| `home.features.selfBuilt` | 自研底座 | 核心技术全链路自研，确保 Token 输出高效、稳定。 |
| `home.features.hardcore` | 硬核支撑 | 拥有自有算力资源与硬件集群，从底层物理设备把控响应速度。 |
| `home.features.costPerf` | 极致性价比 | 省去中间环节成本，为您提供更具竞争力的 Token 供应保障。 |

公共按钮文案：`home.features.learnMore`（中文「了解更多」/ 英文 「Learn More」）。

## 前端实现

- **组件**：`src/pages/HomePage.tsx` 中 `FEATURE_CONFIG`（3 项）、`FEATURE_STYLES`（与 `key` 一一对应）。
- **布局**：`grid` 在小屏 2 列、大屏 `lg:grid-cols-3` 三列等宽。
- **图标**（Font Awesome solid）：`selfBuilt` → `faLayerGroup`，`hardcore` → `faServer`，`costPerf` → `faChartLine`。
- **「了解更多」链接**：依次为 `/docs/self-built`、`/docs/hardcore`、`/docs/cost-performance`（与文档中心侧栏及 `docsFeature.*` 正文一致）。详见 `docs/documentation-center.md`。

## 维护说明

- 仅改文案：编辑 `src/locales/zh.json` / `src/locales/en.json` 的 `home.features` 下对应键，**勿改 key 名**（`selfBuilt` / `hardcore` / `costPerf`），否则需同步改 `HomePage.tsx` 与本文档。
- 增删卡片数量：需调整 `FEATURE_CONFIG`、`FEATURE_STYLES`、locale 与网格 `grid-cols-*` 类名。

## 历史

- 曾为四张卡片（统一接口 / 低延迟 / 透明计价 / 隐私优先）；现改为三张，并采用「自研底座 / 硬核支撑 / 极致性价比」产品线表述。
