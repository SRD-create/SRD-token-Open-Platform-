import { useTranslation } from 'react-i18next'

/** 轻量噪点纹理，模拟印章边缘渗透感 */
const STAMP_NOISE_BG =
  'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.82\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.55\'/%3E%3C/svg%3E")'

const ZHE_CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const

/**
 * 将「直减 offPercent%」换算为中式「几折」文案（售价 = 标价 × (100-off)/100 → 折数 = (100-off)/10）。
 * 如 40% OFF → 六折；50% OFF → 五折。
 */
export function offPercentToChineseZheLabel(offPercent: number): string {
  const off = Math.round(Math.max(1, Math.min(99, offPercent)))
  const zhe = (100 - off) / 10
  if (!Number.isFinite(zhe) || zhe <= 0 || zhe > 10) return `${off}%`
  const rounded = Math.round(zhe * 10) / 10
  if (Number.isInteger(rounded) && rounded >= 1 && rounded <= 9) {
    return `${ZHE_CN[rounded]}折`
  }
  const num = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '')
  return `${num}折`
}

type PartnerDiscountStampProps = {
  /** 展示为「{{n}}% OFF」中的 n，建议 1–99 */
  offPercent: number
}

/**
 * 代理加盟档位卡片用：圆形红色「折扣章」样式（参考印章风 UI）。
 */
export function PartnerDiscountStamp({ offPercent }: PartnerDiscountStampProps) {
  const { t, i18n } = useTranslation()
  const pct = Math.round(Math.max(1, Math.min(99, offPercent)))
  const lang = i18n.resolvedLanguage ?? i18n.language
  const isZh = typeof lang === 'string' && lang.toLowerCase().startsWith('zh')
  const zheLabel = offPercentToChineseZheLabel(pct)

  return (
    <div
      className="relative flex h-[4.85rem] w-[4.85rem] select-none items-center justify-center"
      role="img"
      aria-label={
        isZh
          ? t('partners.hero.discountStampAria', { zhe: zheLabel })
          : t('partners.hero.discountStampAria', { pct })
      }
    >
      <div
        className="relative flex h-[4.2rem] w-[4.2rem] flex-col items-center justify-center overflow-hidden rounded-full border-[0.26rem] border-[#d32f2f] bg-white shadow-[0_4px_18px_rgba(211,47,47,0.42)]"
        style={{ transform: 'rotate(-16deg)' }}
      >
        {isZh ? (
          <>
            <span className="relative z-[1] text-[1.02rem] font-black leading-none tracking-tight text-[#c62828] drop-shadow-[0_0.5px_0_rgba(255,255,255,0.35)]">
              {zheLabel}
            </span>
            <span className="relative z-[1] mt-[3px] text-[0.58rem] font-bold leading-none tracking-wide text-[#c62828] drop-shadow-[0_0.5px_0_rgba(255,255,255,0.35)]">
              {t('partners.hero.discountStampSubZh')}
            </span>
          </>
        ) : (
          <>
            <span className="relative z-[1] text-[1.08rem] font-black leading-none tracking-tight text-[#c62828] drop-shadow-[0_0.5px_0_rgba(255,255,255,0.35)]">
              {pct}%
            </span>
            <span className="relative z-[1] mt-[2px] text-[0.62rem] font-black uppercase leading-none tracking-[0.14em] text-[#c62828] drop-shadow-[0_0.5px_0_rgba(255,255,255,0.35)]">
              {t('partners.hero.discountStampOff')}
            </span>
          </>
        )}
        <div
          className="pointer-events-none absolute inset-0 rounded-full bg-cover opacity-[0.26] mix-blend-multiply"
          style={{ backgroundImage: STAMP_NOISE_BG }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-full opacity-90 mix-blend-multiply [mask-image:radial-gradient(circle_at_50%_50%,black_62%,transparent_100%)]"
          style={{ backgroundImage: STAMP_NOISE_BG }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)]"
          aria-hidden
        />
      </div>
    </div>
  )
}
