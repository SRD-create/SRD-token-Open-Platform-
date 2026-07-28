import { vendorIconSrc } from '@/assets/icons/vendorIcons'

export function VendorMark({ id, size = 'sm' }: { id: string; size?: 'xs' | 'sm' | 'md' }) {
  const src = vendorIconSrc(id)
  const box =
    size === 'xs' ? 'h-5 w-5' : size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'
  const pad = size === 'xs' ? 'p-[3px]' : size === 'sm' ? 'p-[5px]' : 'p-1.5'
  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center overflow-hidden rounded-lg ${pad} bg-gradient-to-b from-zinc-50 to-zinc-200/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_0_0_1px_rgba(34,211,238,0.22)] ring-1 ring-cyan-400/25`}
    >
      <img
        src={src}
        alt=""
        className="h-full w-full object-contain [filter:saturate(1.08)_contrast(1.05)]"
        loading="lazy"
      />
    </span>
  )
}
