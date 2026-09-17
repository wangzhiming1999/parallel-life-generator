import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { animate, stagger, type JSAnimation } from 'animejs'
import { useAnimeLoop } from '../hooks/useMotion'
import { charStagger, EASE, prefersReducedMotion, themeColor } from '../lib/motion'

/**
 * 走马灯式流式渲染：把流式文本拆成逐字符 span，用 anime.js 让新到的字符
 * 暖光浮现（暗 → 亮 → 常亮），形成灯光逐字点亮的走马灯效果。
 *
 * 相比上一版纯 CSS 实现（每字符挂 animation-delay）的两处改进：
 * 1. 只有「本次新增的字符」进入动画队列。旧实现里每个替换成字符的 span 都挂
 *    固定 delay，长段落尾字的 delay 会被硬上限卡住，看起来后半段是「一起亮」。
 * 2. 单批字符过多时按预算压缩 stagger 步长（见 charStagger），保证尾字也在
 *    1 秒内亮完，不会出现半段灰字停在屏幕上让用户以为卡死。
 */
interface MarqueeTextProps {
  text: string
  /** 相邻字符的点亮间隔（ms） */
  charInterval?: number
  /** 是否为正在流式输出的段落（尾部持续点亮 + 前沿光晕） */
  active?: boolean
}

/** 单个字符从暗到常亮的时长 */
const CHAR_LIGHT_MS = 700

export default function MarqueeText({ text, charInterval = 28, active = false }: MarqueeTextProps) {
  const chars = useMemo(() => Array.from(text), [text])
  const rootRef = useRef<HTMLSpanElement | null>(null)
  /** 已点亮的字符数：只对新增字符排队，已亮过的字符不重播 */
  const litRef = useRef(0)
  /** 存活中的动画实例，卸载时统一 revert（不能每批都 revert，否则正在渐亮的字符会被打断成「直接亮」） */
  const runningRef = useRef<JSAnimation[]>([])

  const glowRef = useAnimeLoop<HTMLSpanElement>({
    opacity: [0.25, 0.9],
    scale: [0.8, 1.2],
    duration: 550,
    alternate: true,
    ease: EASE.breathe,
  })

  useLayoutEffect(() => {
    if (!active) {
      litRef.current = 0
      return
    }
    const root = rootRef.current
    if (!root) return

    const spans = Array.from(root.querySelectorAll<HTMLElement>('.marquee-char'))
    if (spans.length < litRef.current) litRef.current = 0 // 文本被换掉（换幕）时从头点亮
    const fresh = spans.slice(litRef.current)
    litRef.current = spans.length
    if (!fresh.length || prefersReducedMotion()) return

    const transparent = themeColor('--color-primary-strong', 0)
    const lit = themeColor('--color-primary-strong', 0.85)
    const animation = animate(fresh, {
      opacity: [0.12, 1, 1],
      // textShadow 用等位数的色值字符串，anime.js 才能逐帧插值出「亮一下再收」
      textShadow: [`0 0 0px ${transparent}`, `0 0 12px ${lit}`, `0 0 0px ${transparent}`],
      duration: CHAR_LIGHT_MS,
      delay: stagger(charStagger(fresh.length, charInterval)),
      ease: EASE.out,
    })
    runningRef.current = [...runningRef.current.filter((item) => !item.completed), animation]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, chars.length, charInterval])

  // 卸载（含 StrictMode 模拟卸载）时清场：已完成的动画留在元素上的是终态 inline style，
  // 一并 revert 并复位计数，重新挂载才能从第一个字重新点亮。
  useEffect(
    () => () => {
      runningRef.current.forEach((animation) => animation.revert())
      runningRef.current = []
      litRef.current = 0
    },
    [],
  )

  if (!active) {
    // 已完成段落：整段常亮，不再逐字动画
    return <>{text}</>
  }

  return (
    <span ref={rootRef}>
      {chars.map((ch, i) => (
        <span key={`${i}-${ch}`} className="marquee-char">
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
      <span ref={glowRef} className="marquee-glow" aria-hidden="true" />
    </span>
  )
}
