import { useEffect, useLayoutEffect, useRef } from 'react'
import { animate, type AnimationParams, type JSAnimation, type TargetsParam } from 'animejs'
import { prefersReducedMotion } from '../lib/motion'

/**
 * anime.js 在 React 里的统一接线层。
 *
 * 两条约定：
 * 1. 元素不要用 CSS 写初始隐藏态。起点一律写进动画参数（如 `opacity: [0, 1]`），
 *    由 anime.js 在首帧落位；这样 reduced-motion 降级时元素天然停在终态，
 *    不会出现「动画被禁用后内容隐形」的经典事故。
 * 2. 所有动画实例在卸载时 revert，StrictMode 双挂载与组件卸载都不会留下脏 inline style。
 *
 * 选用 useLayoutEffect 是为了在浏览器绘制前应用首帧，避免入场元素闪一下再动画。
 */
const useMotionEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** reduced-motion 时把动画压成 0 时长：语义等价于「直接落到终态」 */
function play(targets: TargetsParam, params: AnimationParams): JSAnimation {
  const instant: AnimationParams = { ...params, duration: 0, delay: 0, loop: false, alternate: false }
  return animate(targets, prefersReducedMotion() ? instant : params)
}

/** 挂载即播放的入场动画，返回挂到目标节点上的 ref */
export function useEnter<T extends HTMLElement = HTMLElement>(params: AnimationParams) {
  return useAnime<T>(params, [])
}

/**
 * deps 变化时播放动画。首帧同样播放，用于「状态变化 → 动画到新状态」的场景
 * （脉冲条宽度、幕进度点尺寸…）。
 *
 * params 不放进依赖数组：调用方通常写内联对象，每渲染都是新引用；
 * 依赖由 deps 显式给出，effect 闭包天然捕获本次渲染的最新 params。
 */
export function useAnime<T extends HTMLElement = HTMLElement>(
  params: AnimationParams,
  deps: unknown[],
) {
  const ref = useRef<T | null>(null)

  useMotionEffect(() => {
    const el = ref.current
    if (!el) return
    const animation = play(el, params)
    return () => {
      animation.revert()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return ref
}

/**
 * 容器内一组子元素的批量动画（配合 anime.js 的 stagger 做序列入场）。
 * selector 相对容器查询，容器自身不参与动画。
 */
export function useAnimeChildren<T extends HTMLElement = HTMLElement>(
  selector: string,
  params: AnimationParams,
  deps: unknown[] = [],
) {
  const ref = useRef<T | null>(null)

  useMotionEffect(() => {
    const root = ref.current
    if (!root) return
    const targets = Array.from(root.querySelectorAll<HTMLElement>(selector))
    if (!targets.length) return
    const animation = play(targets, params)
    return () => {
      animation.revert()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return ref
}

/** 无限循环动画（呼吸、光晕）。reduced-motion 时完全不启动，元素停在 CSS 静态态 */
export function useAnimeLoop<T extends HTMLElement = HTMLElement>(params: AnimationParams) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const animation = animate(el, { loop: true, ...params })
    return () => {
      animation.revert()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return ref
}
