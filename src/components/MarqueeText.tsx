import { useMemo } from 'react'

/**
 * 走马灯式流式渲染：把一段文本拆成逐字符 span，
 * 每个字符带递增的点亮延迟（暖光浮现 → 常亮），形成灯光逐字点亮的走马灯效果。
 *
 * - reserveSpace：传入已完成文本占位，避免逐字渲染导致回流抖动（对长段落用整段+遮罩性能更好）
 * - 这里选择：已完成的段落整体渲染，仅"当前输出段"逐字点亮
 */

interface MarqueeTextProps {
  text: string
  /** 每个字符的点亮间隔（ms） */
  charInterval?: number
  /** 是否为正在流式输出的段落（尾字持续点亮） */
  active?: boolean
}

export default function MarqueeText({ text, charInterval = 28, active = false }: MarqueeTextProps) {
  const chars = useMemo(() => Array.from(text), [text])

  if (!active) {
    // 已完成段落：整段常亮，不再逐字动画
    return <>{text}</>
  }

  return (
    <>
      {chars.map((ch, i) => (
        <span
          key={`${i}-${ch}`}
          className="marquee-char"
          style={{ animationDelay: `${Math.min(i * charInterval, 3000)}ms` }}
        >
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
      <span className="marquee-glow" aria-hidden="true" />
    </>
  )
}
