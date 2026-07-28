/** 文档区右侧 `#docs-main` 为滚动容器时置顶；存在该节点时不改 window 滚动，避免与 `docs-viewport-lock` 抢滚轮 */
export function scrollDocsMainToTop() {
  const el = document.getElementById('docs-main')
  if (el) {
    el.scrollTop = 0
    return
  }
  window.scrollTo(0, 0)
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}
