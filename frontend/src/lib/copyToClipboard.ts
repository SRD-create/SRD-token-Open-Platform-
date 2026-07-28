/**
 * 复制到剪贴板：优先 Async Clipboard，失败时用 execCommand（移动端 / 非 HTTPS 更稳）。
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined' || text.length === 0) return false

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* 继续走回退 */
    }
  }

  if (copyWithHiddenTextarea(text)) return true
  if (copyWithContentEditable(text)) return true
  return false
}

function copyWithHiddenTextarea(text: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;padding:0;margin:0;border:none;outline:none;opacity:0;'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** 部分 iOS WebKit 对 textarea + copy 不稳定，contentEditable 更易成功。 */
function copyWithContentEditable(text: string): boolean {
  try {
    const el = document.createElement('div')
    el.contentEditable = 'true'
    el.textContent = text
    el.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;padding:0;margin:0;overflow:hidden;opacity:0;'
    document.body.appendChild(el)
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(el)
    sel?.removeAllRanges()
    sel?.addRange(range)
    const ok = document.execCommand('copy')
    sel?.removeAllRanges()
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}
