import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

type BridgeRes = { err_msg?: string }

declare global {
  interface Window {
    WeixinJSBridge?: {
      invoke: (
        api: string,
        args: Record<string, string>,
        cb: (res: BridgeRes) => void,
      ) => void
    }
  }
}

function inWeChat(): boolean {
  return /MicroMessenger/i.test(navigator.userAgent)
}

function normalizeInvokeResult(errMsg: string): 'ok' | 'cancel' | 'fail' | 'unknown' {
  const s = errMsg.trim()
  const lower = s.toLowerCase()
  if (lower === 'requestmerchanttransfer:ok' || lower === 'request_merchant_transfer:ok') return 'ok'
  if (lower.includes('cancel')) return 'cancel'
  if (lower.includes('fail') || lower.includes('denied')) return 'fail'
  return 'unknown'
}

/**
 * 微信内置浏览器内打开：从 URL 读取 `package`、`mchid`、`appid`，调起「确认收款」。
 * 与佣金提现扫码页配套；正式环境需按文档补 `wx.config` / `checkJsApi` 等。
 */
export function WechatMerchantConfirmPage() {
  const [params] = useSearchParams()
  const packageInfo = useMemo(() => params.get('package')?.trim() ?? '', [params])
  const mchId = useMemo(() => params.get('mchid')?.trim() ?? '', [params])
  const appId = useMemo(() => params.get('appid')?.trim() ?? '', [params])

  const [phase, setPhase] = useState<'check' | 'invoking' | 'done' | 'error'>('check')
  const [message, setMessage] = useState('')

  const missing = !packageInfo || !mchId || !appId

  const invoke = useCallback(() => {
    if (missing) {
      setPhase('error')
      setMessage('链接参数不完整（需要 package、mchid、appid）。')
      return
    }
    if (!inWeChat()) {
      setPhase('error')
      setMessage('请在微信中打开本链接以确认收款。')
      return
    }
    const bridge = window.WeixinJSBridge
    if (!bridge?.invoke) {
      setPhase('error')
      setMessage('当前环境未提供 WeixinJSBridge，请稍后重试或更新微信版本。')
      return
    }
    setPhase('invoking')
    bridge.invoke(
      'requestMerchantTransfer',
      {
        mchId,
        appId,
        package: packageInfo,
      },
      (res) => {
        const errMsg = String(res?.err_msg ?? '')
        const r = normalizeInvokeResult(errMsg)
        if (r === 'ok') {
          setPhase('done')
          setMessage('已调起确认流程。是否到账以商户后台查单为准。')
          return
        }
        if (r === 'cancel') {
          setPhase('error')
          setMessage('你已取消确认。')
          return
        }
        setPhase('error')
        setMessage(errMsg ? `未完成确认：${errMsg}` : '未完成确认。')
      },
    )
  }, [appId, mchId, missing, packageInfo])

  useEffect(() => {
    if (missing) {
      setPhase('error')
      setMessage('链接参数不完整（需要 package、mchid、appid）。')
      return
    }
    if (!inWeChat()) {
      setPhase('error')
      setMessage('请在微信中打开本链接以确认收款。')
      return
    }
    const onReady = () => {
      invoke()
    }
    if (typeof window.WeixinJSBridge === 'undefined') {
      document.addEventListener('WeixinJSBridgeReady', onReady, false)
      return () => document.removeEventListener('WeixinJSBridgeReady', onReady, false)
    }
    onReady()
    return undefined
  }, [invoke, missing])

  return (
    <div className="min-h-dvh bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-zinc-900/90 p-6 shadow-xl">
        <h1 className="text-lg font-semibold">微信确认收款</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          {phase === 'invoking' ? '正在调起微信确认窗口…' : message || '处理中…'}
        </p>
        {phase === 'error' && inWeChat() && !missing ? (
          <button
            type="button"
            className="mt-5 w-full rounded-xl bg-white py-2.5 text-sm font-medium text-black"
            onClick={() => invoke()}
          >
            重试调起确认
          </button>
        ) : null}
      </div>
    </div>
  )
}
