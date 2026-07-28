import { motion } from 'framer-motion'

const bar = 'rounded-md bg-zinc-700/80 animate-skeleton'

export function ModuleSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy aria-label="加载中">
      <div className={`h-8 w-1/3 max-w-xs ${bar}`} />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: rows }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: i * 0.05 }}
            className="h-24 rounded-xl border border-white/5 bg-zinc-800/40 animate-skeleton"
          />
        ))}
      </div>
      <div className={`h-40 w-full rounded-xl ${bar}`} />
    </div>
  )
}
