import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef } from 'react'

/** 多频正弦叠加 + 慢漂移，形成不规则、非周期感的节点运动 */
function ConstellationNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const count = 52
    const nodes = Array.from({ length: count }, (_, i) => ({
      bx: 0.06 + Math.random() * 0.88,
      by: 0.06 + Math.random() * 0.88,
      wx: [0.35 + Math.random() * 0.9, 0.65 + Math.random() * 1.1, 1.0 + Math.random() * 0.95] as const,
      wy: [0.4 + Math.random() * 0.85, 0.72 + Math.random() * 1.05, 0.95 + Math.random() * 1.0] as const,
      px: [Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2] as const,
      py: [Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2] as const,
      amp: 0.018 + Math.random() * 0.042,
      driftMul: 0.008 + Math.random() * 0.014,
      driftPhase: i * 0.37 + Math.random(),
    }))

    let raf = 0
    const start = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = container.clientWidth
      const h = container.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)

    const draw = () => {
      const t = (performance.now() - start) / 1000
      const w = container.clientWidth
      const h = container.clientHeight
      const m = Math.min(w, h)
      const linkPx = 0.11 * m + 6 * Math.sin(t * 0.31)
      const linkSq = linkPx * linkPx

      const slow = t * 0.11
      const positions: { x: number; y: number }[] = []

      for (let i = 0; i < count; i++) {
        const n = nodes[i]!
        const dx =
          n.amp *
          (Math.sin(t * n.wx[0] + n.px[0]) * 0.46 +
            Math.sin(t * n.wx[1] * 1.07 + n.px[1]) * 0.33 +
            Math.sin(t * n.wx[2] * 0.89 + n.px[2]) * 0.21)
        const dy =
          n.amp *
          (Math.cos(t * n.wy[0] + n.py[0]) * 0.44 +
            Math.cos(t * n.wy[1] * 1.11 + n.py[1]) * 0.34 +
            Math.cos(t * n.wy[2] * 0.93 + n.py[2]) * 0.22)
        const gx = n.driftMul * Math.sin(slow * 0.73 + n.driftPhase)
        const gy = n.driftMul * Math.cos(slow * 0.61 + n.driftPhase * 1.3)

        let x = w * (n.bx + dx + gx)
        let y = h * (n.by + dy + gy)
        x = Math.max(6, Math.min(w - 6, x))
        y = Math.max(6, Math.min(h - 6, y))
        positions.push({ x, y })
      }

      ctx.clearRect(0, 0, w, h)
      ctx.lineCap = 'round'

      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const a = positions[i]!
          const b = positions[j]!
          const ddx = a.x - b.x
          const ddy = a.y - b.y
          const d2 = ddx * ddx + ddy * ddy
          if (d2 >= linkSq) continue
          const dist = Math.sqrt(d2)
          const fade = 1 - dist / linkPx
          const alpha = fade * fade * 0.28
          ctx.strokeStyle = `rgba(103, 232, 249, ${alpha})`
          ctx.lineWidth = 0.55 + fade * 0.35
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }

      for (const p of positions) {
        const tw = 0.65 + 0.35 * Math.sin(t * 2.4 + p.x * 0.01)
        ctx.fillStyle = `rgba(207, 250, 254, ${0.35 + tw * 0.45})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.35, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + tw * 0.35})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, 0.65, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-[0.92]" aria-hidden />
    </div>
  )
}

function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const particles = Array.from({ length: 96 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 0.55 + 0.18,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.5 + Math.random() * 1.4,
      drift: (Math.random() - 0.5) * 0.055,
    }))

    let raf = 0
    let last = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = container.clientWidth
      const h = container.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)

    const draw = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05)
      last = t
      const w = container.clientWidth
      const h = container.clientHeight
      ctx.clearRect(0, 0, w, h)

      for (const p of particles) {
        p.phase += dt * p.twinkle
        p.x += p.drift * dt
        if (p.x < -0.05) p.x = 1.05
        if (p.x > 1.05) p.x = -0.05
        const alpha = 0.22 + Math.sin(p.phase) * 0.18
        ctx.fillStyle = `rgba(199, 210, 254, ${alpha})`
        ctx.beginPath()
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
    </div>
  )
}

export function LoginBackdrop() {
  const reduce = useReducedMotion()

  if (reduce) {
    return (
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-[#0c0c12]"
        aria-hidden
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_-15%,rgba(129,140,248,0.35),transparent_60%),radial-gradient(ellipse_80%_50%_at_80%_100%,rgba(34,211,238,0.12),transparent_50%)]" />
      </div>
    )
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-[#0c0c12]"
      aria-hidden
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_95%_55%_at_50%_35%,rgba(79,70,229,0.16),transparent_58%)]" />

      <motion.div
        className="absolute left-[28%] top-[38%] h-[min(60vw,360px)] w-[min(60vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/[0.22] blur-[85px]"
        animate={{
          opacity: [0.55, 1, 0.6, 0.55],
          scale: [1, 1.18, 1.06, 1],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute right-[5%] top-[8%] h-[min(45vw,280px)] w-[min(45vw,280px)] rounded-full bg-sky-400/[0.2] blur-[72px]"
        animate={{
          x: [0, -24, 8, 0],
          y: [0, 40, 12, 0],
          opacity: [0.5, 0.95, 0.55, 0.5],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
      />

      <motion.div
        className="absolute -top-[20%] left-[35%] h-[min(120vh,900px)] w-[min(55vw,420px)] -translate-x-1/2 rotate-[18deg] rounded-full bg-gradient-to-b from-indigo-300/25 via-transparent to-cyan-300/15 blur-[40px]"
        animate={{ y: ['-5%', '8%', '-3%'], opacity: [0.35, 0.65, 0.4] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="login-backdrop-grid absolute inset-0" />

      <ConstellationNetwork />
      <ParticleField />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_88%_72%_at_50%_48%,transparent_0%,rgba(12,12,18,0.12)_52%,rgba(10,10,14,0.55)_100%)]" />
    </div>
  )
}
