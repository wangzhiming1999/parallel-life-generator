import { stagger } from 'animejs'
import { useAnimeChildren } from '../hooks/useMotion'
import { EASE } from '../lib/motion'

/**
 * 流式等待指示：三点呼吸。
 *
 * 从「CSS infinite keyframes + 内联 animationDelay」换成了 anime.js 的
 * stagger + loop：交替呼吸在同一时间轴上排开，节奏比逐个手写 delay 更整齐；
 * reduced-motion 下不启动动画，三点直接停在可见态。
 */
export default function BreathingDots() {
  const ref = useAnimeChildren<HTMLSpanElement>('.breathing-dot', {
    opacity: [0.35, 1],
    scale: [0.9, 1.15],
    duration: 800,
    delay: stagger(250),
    loop: true,
    alternate: true,
    ease: EASE.breathe,
  })

  return (
    <span ref={ref} className="inline-flex gap-1.5" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="breathing-dot inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: 'var(--color-primary-strong)' }}
        />
      ))}
    </span>
  )
}
