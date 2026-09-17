/**
 * 动效令牌与无障碍判定。
 *
 * 全站动画统一由 anime.js 驱动，这里只放时长 / 缓动常量与纯函数：
 * 一是让组件之间保持同一套节奏，二是纯函数可以直接单测。
 */

/** 动效时长（ms） */
export const DURATION = {
  /** 小元素浮现：进度点、标签 */
  quick: 420,
  /** 正文段落、提示条 */
  enter: 520,
  /** 卡片级入场：星图、感悟卡、弹窗 */
  card: 720,
  /** 慢镜头：标题字距收拢 */
  title: 1400,
  /** 幕间淡出 / 淡入 */
  cross: 560,
} as const

/** anime.js v4 缓动名，统一在这里取，避免每个组件各写一套 */
export const EASE = {
  /** 默认出场 */
  out: 'outQuad',
  /** 更软的出场，用在大块内容上 */
  outSoft: 'outCubic',
  /** 往返呼吸：呼吸点、光晕 */
  breathe: 'inOutSine',
  /** 幕间交叉淡入淡出 */
  cross: 'inOutQuad',
  /** 选项浮现的轻微过冲 */
  pop: 'outBack(1.35)',
} as const

/**
 * 一次流式追加里，逐字点亮的 stagger 步长。
 *
 * 单批字符少时保持细腻的逐字质感；单批字符多（网络抖动后一次涌入几十上百字）时
 * 压缩步长，保证尾字也能在 budgetMs 内亮完——否则会出现「半段字灰着不动」，
 * 用户会以为卡住了。旧的 CSS animationDelay 实现里这个上限被硬编码成 3s，
 * 长段落尾字要等三秒才亮，这次一并修掉。
 */
export function charStagger(count: number, interval: number, budgetMs = 900): number {
  if (count <= 1) return interval
  const step = Math.floor(budgetMs / (count - 1))
  return Math.max(4, Math.min(interval, step))
}

/** 系统是否要求减少动效：为真时动画直接落到终态，不播放过程 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 给颜色加透明度，返回 anime.js 能逐帧插值的具体色值字符串。
 *
 * 为什么需要它：anime.js 无法插值 `var(--color-primary-strong)` 这类 CSS 变量，
 * 而文字发光要跟随主题色（亮/暗模式不同）。所以把变量先解析成 rgba 再交给动画。
 * 支持 `#rrggbb` 与 `rgb()/rgba()`；无法解析时返回 null 由调用方兜底。
 */
export function withAlpha(color: string, alpha: number): string | null {
  const value = color.trim()
  const hex = /^#([0-9a-f]{6})$/i.exec(value)?.[1]
  if (hex) {
    const r = Number.parseInt(hex.slice(0, 2), 16)
    const g = Number.parseInt(hex.slice(2, 4), 16)
    const b = Number.parseInt(hex.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value)
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`
  return null
}

/** 读取当前主题里的颜色变量并附加透明度（暗色模式会自动跟随 prefers-color-scheme） */
export function themeColor(variable: string, alpha = 1, fallback = '#000000'): string {
  const raw = typeof document === 'undefined'
    ? ''
    : getComputedStyle(document.documentElement).getPropertyValue(variable)
  // 兜底保证即使变量读取失败也拿到一个合法色值，而不是让 anime.js 拿到空字符串
  return withAlpha(raw, alpha) ?? withAlpha(fallback, alpha) ?? fallback
}
