import { useReducedMotion } from 'framer-motion'

/** 首页专用：暗色极光/网格漂移，不拦截点击；尊重系统「减少动态效果」 */
export function HomeAuroraBackdrop() {
  const reduceMotion = useReducedMotion()

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />

      {reduceMotion ? (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_50%_at_50%_-8%,rgba(99,102,241,0.14),transparent_58%),radial-gradient(ellipse_42%_36%_at_92%_8%,rgba(139,92,246,0.1),transparent)]" />
      ) : (
        <>
          <div className="home-backdrop-grid absolute inset-0 opacity-40" />
          <div className="home-aurora-blob home-aurora-blob-1 absolute -left-[18%] top-[-28%] h-[min(78vw,720px)] w-[min(78vw,720px)] rounded-full bg-indigo-600/30 blur-[min(28vw,140px)]" />
          <div className="home-aurora-blob home-aurora-blob-2 absolute -right-[12%] top-[8%] h-[min(55vw,520px)] w-[min(55vw,520px)] rounded-full bg-cyan-500/20 blur-[min(22vw,120px)]" />
          <div className="home-aurora-blob home-aurora-blob-3 absolute left-[20%] bottom-[-35%] h-[min(90vw,780px)] w-[min(90vw,780px)] rounded-full bg-violet-600/22 blur-[min(32vw,160px)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_0%,rgba(59,130,246,0.06),transparent_55%)]" />
        </>
      )}
    </div>
  )
}
