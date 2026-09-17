import { useLayoutEffect, useRef } from 'react'
import { animate } from 'animejs'
import { EASE, prefersReducedMotion, themeColor } from '../lib/motion'

/** 只渲染当前幕前后各 N 幕，18 幕不塞满一行 */
const WINDOW = 4

interface SceneProgressProps {
  total: number
  scene: number
}

interface DotGeometry {
  width: number
  height: number
  opacity: number
  background: string
}

/**
 * 单个进度点的几何完全由「点号 + 当前幕」决定，因此上一帧的值不需要额外记录，
 * 直接代入上一幕算出来即可——这也让新进入窗口的点能接到正确起点（从远处位置
 * 缩进当前排布），而不是从 0 宽度突然长出。
 */
function geometryOf(dot: number, current: number, active: string, idle: string): DotGeometry {
  const distance = Math.abs(dot - current)
  return {
    width: distance === 0 ? 16 : distance <= 2 ? 5 : 3,
    height: distance === 0 ? 4 : 3,
    opacity: distance === 0 ? 1 : distance <= 2 ? 0.85 : 0.4,
    background: dot <= current ? active : idle,
  }
}

/** 幕进度指示：当前幕为中心展开的波纹式位移（原来的 CSS transition-all 换成了 anime.js） */
export default function SceneProgress({ total, scene }: SceneProgressProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const previousSceneRef = useRef(scene)
  const mountedRef = useRef(false)

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const isFirst = !mountedRef.current
    const previous = previousSceneRef.current
    mountedRef.current = true
    previousSceneRef.current = scene
    // 首次挂载也要跑一遍（0 时长直接落位），否则点没有尺寸和颜色；之后仅在换幕时动
    if (previous === scene && !isFirst) return

    const active = themeColor('--color-primary-strong')
    const idle = themeColor('--color-line')
    const instant = prefersReducedMotion()
    const dots = Array.from(root.querySelectorAll<HTMLElement>('.scene-dot'))
    if (!dots.length) return
    const scenes = dots.map((dot) => Number(dot.dataset.scene))

    const animations = dots.map((dot, index) => {
      const number = scenes[index] ?? 0
      const from = geometryOf(number, previous, active, idle)
      const to = geometryOf(number, scene, active, idle)
      return animate(dot, {
        width: [from.width, to.width],
        height: [from.height, to.height],
        opacity: [from.opacity, to.opacity],
        backgroundColor: [from.background, to.background],
        duration: instant || isFirst ? 0 : 520,
        // 从当前幕向外扩散，越远的点越晚动
        delay: instant || isFirst ? 0 : Math.abs(number - scene) * 24,
        ease: EASE.outSoft,
      })
    })

    return () => {
      // 用 cancel 而不是 revert：点尺寸就是当前落位状态，revert 会抹掉 inline 尺寸
      // 让点退回 0 宽而不可见。StrictMode 双挂载时第二次 effect 因「幕序号没变」不再补写，
      // 于是开发模式看不到进度点、生产模式却正常。cancel 只停播放、保留已落位的值。
      animations.forEach((animation) => animation.cancel())
    }
  }, [scene, total])

  return (
    <div
      ref={ref}
      className="flex justify-center items-center gap-1 mb-4 overflow-hidden"
      style={{ maxWidth: 180, margin: '0 auto 16px' }}
      aria-hidden="true"
    >
      {Array.from({ length: total }, (_, index) => {
        const number = index + 1
        if (Math.abs(number - scene) > WINDOW) return null
        return <span key={number} data-scene={number} className="scene-dot inline-block rounded-full" />
      })}
    </div>
  )
}
