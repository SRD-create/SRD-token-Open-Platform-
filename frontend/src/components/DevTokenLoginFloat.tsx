import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faWrench } from '@fortawesome/free-solid-svg-icons'
import { useAuth } from '@/auth/useAuth'
import { notify } from '@/lib/toast'

const DEV_TOKEN_FLOAT_POS_KEY = 'dev_token_float_pos_v1'
const DEV_TOKEN_FLOAT_VALUE_KEY = 'dev_token_float_value_v1'
const DEV_TOKEN_FLOAT_COLLAPSED_KEY = 'dev_token_float_collapsed_v1'

type FloatPos = { x: number; y: number }

function readSavedPos(): FloatPos {
  try {
    const raw = localStorage.getItem(DEV_TOKEN_FLOAT_POS_KEY)
    if (!raw) return { x: 0, y: 0 }
    const o = JSON.parse(raw) as { x?: unknown; y?: unknown }
    if (typeof o.x === 'number' && typeof o.y === 'number' && o.x >= 0 && o.y >= 0) {
      return { x: o.x, y: o.y }
    }
  } catch {
    /* ignore */
  }
  return { x: 0, y: 0 }
}

function readSavedTokenDraft(): string {
  try {
    return localStorage.getItem(DEV_TOKEN_FLOAT_VALUE_KEY) || ''
  } catch {
    return ''
  }
}

function readSavedCollapsed(): boolean {
  try {
    return localStorage.getItem(DEV_TOKEN_FLOAT_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function DevTokenLoginFloat() {
  const isDev = import.meta.env.DEV
  const { applyTokenLogin, logout } = useAuth()
  const [value, setValue] = useState(readSavedTokenDraft)
  const [pos, setPos] = useState<FloatPos>(readSavedPos)
  const [collapsed, setCollapsed] = useState(readSavedCollapsed)
  const dragging = useRef(false)
  const dragDelta = useRef({ dx: 0, dy: 0 })
  const dragStart = useRef({ x: 0, y: 0 })
  const dragMoved = useRef(false)

  useEffect(() => {
    if (!isDev) return
    try {
      localStorage.setItem(DEV_TOKEN_FLOAT_POS_KEY, JSON.stringify(pos))
    } catch {
      /* ignore */
    }
  }, [isDev, pos])

  useEffect(() => {
    if (!isDev) return
    try {
      if (value) localStorage.setItem(DEV_TOKEN_FLOAT_VALUE_KEY, value)
      else localStorage.removeItem(DEV_TOKEN_FLOAT_VALUE_KEY)
    } catch {
      /* ignore */
    }
  }, [isDev, value])

  useEffect(() => {
    if (!isDev) return
    try {
      localStorage.setItem(DEV_TOKEN_FLOAT_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed, isDev])

  if (!isDev) return null

  const floatPosStyle = {
    right: pos.x === 0 ? 16 : 'auto',
    bottom: pos.y === 0 ? 16 : 'auto',
    left: pos.x === 0 ? 'auto' : pos.x,
    top: pos.y === 0 ? 'auto' : pos.y,
  } as const

  if (collapsed) {
    return (
      <div className="fixed z-[90]" style={floatPosStyle}>
        <button
          type="button"
          aria-label="展开本地登录浮窗"
          title="展开"
          className="group relative flex h-14 w-14 items-center justify-center rounded-full border border-indigo-300/15 bg-[radial-gradient(circle_at_35%_30%,rgba(71,85,105,0.75),rgba(30,41,59,0.88)_45%,rgba(2,6,23,0.98)_75%)] shadow-[0_0_0_1px_rgba(99,102,241,0.2),0_0_24px_rgba(30,41,59,0.5),0_10px_28px_rgba(2,6,23,0.7)] transition duration-200 hover:scale-105 hover:border-indigo-300/25 hover:shadow-[0_0_0_1px_rgba(129,140,248,0.35),0_0_34px_rgba(30,41,59,0.7),0_12px_30px_rgba(2,6,23,0.78)]"
          onPointerDown={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            dragging.current = true
            dragMoved.current = false
            dragStart.current = { x: e.clientX, y: e.clientY }
            dragDelta.current = {
              dx: e.clientX - box.left,
              dy: e.clientY - box.top,
            }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return
            const movedX = Math.abs(e.clientX - dragStart.current.x)
            const movedY = Math.abs(e.clientY - dragStart.current.y)
            if (movedX > 3 || movedY > 3) dragMoved.current = true
            const nx = Math.max(8, e.clientX - dragDelta.current.dx)
            const ny = Math.max(8, e.clientY - dragDelta.current.dy)
            setPos({ x: nx, y: ny })
          }}
          onPointerUp={(e) => {
            dragging.current = false
            e.currentTarget.releasePointerCapture(e.pointerId)
            if (!dragMoved.current) setCollapsed(false)
          }}
          onPointerCancel={() => {
            dragging.current = false
          }}
        >
          <span className="pointer-events-none absolute inset-0 animate-pulse rounded-full bg-indigo-400/12" />
          <FontAwesomeIcon
            icon={faWrench}
            className="relative z-10 h-[1.15rem] w-[1.15rem] text-indigo-100/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] transition group-hover:text-indigo-50"
            aria-hidden
          />
        </button>
      </div>
    )
  }

  return (
    <div
      className="fixed z-[90] w-[min(92vw,22rem)]"
      style={floatPosStyle}
    >
      <div className="rounded-2xl border border-white/10 bg-surface-900/95 p-3 shadow-2xl backdrop-blur">
        <div
          className="mb-2 flex cursor-move select-none items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1.5"
          onPointerDown={(e) => {
            const box = e.currentTarget.parentElement?.getBoundingClientRect()
            dragging.current = true
            dragDelta.current = {
              dx: e.clientX - (box?.left ?? 0),
              dy: e.clientY - (box?.top ?? 0),
            }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return
            const nx = Math.max(8, e.clientX - dragDelta.current.dx)
            const ny = Math.max(8, e.clientY - dragDelta.current.dy)
            setPos({ x: nx, y: ny })
          }}
          onPointerUp={(e) => {
            dragging.current = false
            e.currentTarget.releasePointerCapture(e.pointerId)
          }}
          onPointerCancel={() => {
            dragging.current = false
          }}
        >
          <p className="text-xs font-semibold text-zinc-200">本地模拟线上已登录用户</p>
          <div className="flex items-center">
            <button
              type="button"
              onPointerDown={(e) => {
                // Prevent the drag-handle pointer capture from swallowing click.
                e.stopPropagation()
              }}
              onClick={() => setCollapsed((v) => !v)}
              className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-300 hover:border-white/20 hover:text-white"
            >
              {collapsed ? '展开' : '收起'}
            </button>
          </div>
        </div>
        {collapsed ? null : (
          <>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="粘贴线上 token（Bearer 后面的字符串）"
              className="w-full rounded-xl border border-white/10 bg-surface-950 px-3 py-2 text-xs text-zinc-100 outline-none ring-cyan-400/30 placeholder:text-zinc-500 focus:ring-2"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setValue('')
                  logout()
                }}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:border-white/20 hover:text-white"
              >
                退出登录
              </button>
              <button
                type="button"
                onClick={() => {
                  const token = value.trim()
                  if (!token) {
                    notify.error('请先输入 token')
                    return
                  }
                  applyTokenLogin(token)
                  notify.success('已写入 token，正在刷新登录态')
                }}
                className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-cyan-400"
              >
                确定登录
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
