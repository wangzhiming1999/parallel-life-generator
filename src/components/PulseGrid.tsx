import { useLayoutEffect, useRef } from 'react'
import { animate } from 'animejs'
import { EASE, prefersReducedMotion } from '../lib/motion'
import type { LifeDimension } from '../lib/universe'

interface PulseGridProps {
  dimensions: Array<[LifeDimension, number]>
}

/**
 * 平行宇宙脉冲条。
 *
 * 宽度不再由 React 内联 style + CSS transition 维护（那样会出现「先跳到新值
 * 再滑回去」的闪动），改为 anime.js 独占：组件只负责初始落位，后续数值变化
 * 从「上一个值」生长到「新值」，前几帧由 useLayoutEffect 在绘制前补上。
 */
export default function PulseGrid({ dimensions }: PulseGridProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  /** 每个维度的上一次数值：作为下一次动画的起点 */
  const previousRef = useRef<Record<string, number>>({})
  const signature = dimensions.map(([label, value]) => `${label}:${value}`).join('|')

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const instant = prefersReducedMotion()
    const animations = dimensions.flatMap(([label, value], index) => {
      const bar = root.querySelector<HTMLElement>(`[data-pulse="${label}"]`)
      if (!bar) return []
      const from = previousRef.current[label] ?? 0
      // 首次落位与数值未变都不需要过渡，避免无意义的重播
      const isFirst = previousRef.current[label] === undefined
      if (!isFirst && from === value) return []
      return [animate(bar, {
        width: [`${from}%`, `${value}%`],
        duration: instant || isFirst ? 0 : 620,
        delay: instant || isFirst ? 0 : index * 60,
        ease: EASE.outSoft,
      })]
    })
    dimensions.forEach(([label, value]) => {
      previousRef.current[label] = value
    })
    return () => {
      // 用 cancel 而不是 revert：这里的条宽是「当前真实状态的落位」，revert 会把
      // inline width 抹掉退回 width:auto（=100%，条子变满格）。StrictMode 下挂载
      // 会执行两次 effect，revert 恰好会让第二次因为「数值没变」而不再补写，
      // 于是开发模式看到满格条、生产模式却正常。cancel 只停播放、保留已落位的值。
      animations.forEach((animation) => animation.cancel())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  return (
    <div ref={ref} className="pulse-grid">
      {dimensions.map(([label, value]) => (
        <div key={label} className="pulse-item">
          <span>{label}</span><strong>{value}</strong>
          <i><b data-pulse={label} /></i>
        </div>
      ))}
    </div>
  )
}
