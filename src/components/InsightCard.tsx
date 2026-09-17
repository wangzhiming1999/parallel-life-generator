import { useAnime } from '../hooks/useMotion'
import { DURATION, EASE, themeColor } from '../lib/motion'
import MarqueeText from './MarqueeText'

interface InsightCardProps {
  text: string
  /** 正文还在流式输出：卡片柔入、不抢戏 */
  streaming: boolean
}

/**
 * 感悟卡（截图传播的视觉锚点）。
 *
 * 流式阶段半透明柔入，正文写完后由 anime.js 把 box-shadow 渐亮成暖光。
 * 两段都写成显式色值字符串（而不是 `none` / CSS 变量），anime.js 才能逐帧插值；
 * 颜色在读主题变量时解析，暗色模式会自动跟随。
 */
export default function InsightCard({ text, streaming }: InsightCardProps) {
  const glow = themeColor('--color-primary-strong', 0.18)
  const clear = themeColor('--color-primary-strong', 0)

  const ref = useAnime<HTMLElement>(
    streaming
      ? {
          opacity: [0, 0.75],
          boxShadow: `0 0 0px ${clear}`,
          duration: DURATION.enter,
          ease: EASE.out,
        }
      : {
          opacity: 1,
          boxShadow: `0 0 24px ${glow}`,
          duration: DURATION.card,
          ease: EASE.outSoft,
        },
    [streaming],
  )

  return (
    <section ref={ref} className="insight-card mt-8">
      <span className="insight-mark">✶</span>
      <p className="insight-text">
        <MarqueeText text={text} charInterval={60} active={streaming} />
      </p>
    </section>
  )
}
