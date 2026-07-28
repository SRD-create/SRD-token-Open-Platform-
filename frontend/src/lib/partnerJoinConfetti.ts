import confetti from 'canvas-confetti'

type Fire = ReturnType<typeof confetti.create>

const COLORS = [
  '#38bdf8',
  '#60a5fa',
  '#818cf8',
  '#a78bfa',
  '#c084fc',
  '#f472b6',
  '#fbbf24',
  '#34d399',
  '#facc15',
]

type CornerBurstOpts = {
  /** 整体强度，用于第二波略轻 */
  intensity?: number
  /**
   * 底角水平位置：左角 x = inset，右角 x = 1 − inset（canvas 归一化坐标）。
   * 越小越贴近左右边；默认 0.035 与历史代理加盟礼花一致。
   */
  originInsetX?: number
  /** 为 `true` 时左下角 x=0、右下角 x=1，与 canvas 左右边对齐（忽略 inset 钳制） */
  flushToCanvasCorners?: boolean
}

/**
 * 从左下、右下「角点」各喷一发（canvas 归一化坐标，相对当前 confetti canvas）。
 * y=1 贴底边；角度略向中间上方扇形散开。
 */
function burstFromBottomCorners(fire: Fire, opts: CornerBurstOpts = {}) {
  const k = opts.intensity ?? 1
  let xl: number
  let xr: number
  if (opts.flushToCanvasCorners) {
    xl = 0
    xr = 1
  } else {
    const inset = opts.originInsetX ?? 0.035
    xl = Math.min(0.48, Math.max(0.004, inset))
    xr = Math.max(0.52, Math.min(0.996, 1 - inset))
  }
  const n = Math.round(88 * k)
  const vel = 48 + 8 * k
  void fire({
    particleCount: n,
    angle: 72,
    spread: 36,
    origin: { x: xl, y: 1 },
    startVelocity: vel,
    gravity: 0.82,
    decay: 0.93,
    ticks: Math.round(360 * k),
    colors: COLORS,
    shapes: ['circle', 'square'],
    scalar: 0.95 + 0.12 * k,
    drift: 0.2,
  })

  void fire({
    particleCount: n,
    angle: 108,
    spread: 36,
    origin: { x: xr, y: 1 },
    startVelocity: vel,
    gravity: 0.82,
    decay: 0.93,
    ticks: Math.round(360 * k),
    colors: COLORS,
    shapes: ['circle', 'square'],
    scalar: 0.95 + 0.12 * k,
    drift: -0.2,
  })
}

export type PartnerJoinConfettiOptions = {
  /** 小画布弹窗内 Worker 偶发不同步，可设为 `false`（默认 `true`） */
  useWorker?: boolean
  /** 与 `prefers-reduced-motion` 对齐；充值成功等场景可传入 `false` 仍展示轻量礼花 */
  disableForReducedMotion?: boolean
  /** 为 `true` 时只发一波双角（无 220ms / 480ms 错峰重复） */
  singleBurst?: boolean
  /** 与 `burstFromBottomCorners` 的 `originInsetX` 一致；弹框底角可设更小如 0.01 */
  originInsetX?: number
  /** 与 `burstFromBottomCorners` 的 `flushToCanvasCorners` 一致；与 `originInsetX` 同时传时以前者为准 */
  flushToCanvasCorners?: boolean
}

/** 多段错峰双角礼花；返回清理函数供卸载时取消定时器并重置 canvas */
export function playPartnerJoinConfetti(
  canvas: HTMLCanvasElement,
  opts?: PartnerJoinConfettiOptions,
): () => void {
  const fire = confetti.create(canvas, {
    resize: true,
    useWorker: opts?.useWorker ?? true,
    disableForReducedMotion: opts?.disableForReducedMotion ?? true,
  })

  const cornerOpts: CornerBurstOpts = opts?.flushToCanvasCorners
    ? { flushToCanvasCorners: true }
    : opts?.originInsetX != null
      ? { originInsetX: opts.originInsetX }
      : {}

  const burstBase: CornerBurstOpts = {
    intensity: opts?.singleBurst ? 1.05 : 1.08,
    ...cornerOpts,
  }
  burstFromBottomCorners(fire, burstBase)

  if (opts?.singleBurst) {
    return () => {
      fire.reset()
    }
  }

  const t1 = window.setTimeout(
    () => burstFromBottomCorners(fire, { intensity: 0.72, ...cornerOpts }),
    220,
  )
  const t2 = window.setTimeout(
    () => burstFromBottomCorners(fire, { intensity: 0.55, ...cornerOpts }),
    480,
  )

  return () => {
    window.clearTimeout(t1)
    window.clearTimeout(t2)
    fire.reset()
  }
}
