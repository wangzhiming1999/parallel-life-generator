import { useState } from 'react'
import { stagger } from 'animejs'
import { useAnimeChildren } from '../hooks/useMotion'
import { DURATION, EASE } from '../lib/motion'

interface ChoiceZoneProps {
  choices: [string, string]
  resumed: boolean
  onChoose: (choice: 0 | 1, decision?: string) => void
}

/**
 * 岔路口交互区。
 *
 * 抽成组件有两个收益：
 * 1. 拿到挂载时机 —— 每幕选项出来时 anime.js 从提示语到两个选项依次浮现，
 *    视线被带着走完「先看这条路，再看那条」。
 * 2. 「我自己决定」的展开态收在这里。选项一被选中组件就卸载，展开态自然复位，
 *    父组件不用再手动清理这份临时状态。
 */
export default function ChoiceZone({ choices, resumed, onChoose }: ChoiceZoneProps) {
  const [customOpen, setCustomOpen] = useState(false)
  const [customText, setCustomText] = useState('')

  const ref = useAnimeChildren<HTMLDivElement>(
    '.choice-prompt, .choice-btn, .custom-decision-trigger',
    {
      opacity: [0, 1],
      y: [10, 0],
      duration: DURATION.enter,
      delay: stagger(90),
      ease: EASE.pop,
    },
  )

  const submitCustom = () => {
    const decision = customText.trim()
    if (decision.length >= 2) onChoose(0, decision)
  }

  return (
    <div ref={ref}>
      <p className="choice-prompt text-center text-[13px] mb-4" style={{ color: 'var(--color-ink-secondary)' }}>
        {resumed ? '从这里继续，你的选择是——' : '岔路口到了，你的选择是——'}
      </p>
      <div className="flex flex-col gap-3 mb-10">
        {choices.map((choice, index) => (
          <button
            key={index}
            onClick={() => onChoose(index as 0 | 1)}
            className="choice-btn"
          >
            <span className="choice-mark">{'①②'[index]}</span>
            {choice}
          </button>
        ))}
        {!customOpen ? (
          <button onClick={() => setCustomOpen(true)} className="custom-decision-trigger">
            <span>＋</span>
            这两个都不是，我自己决定
          </button>
        ) : (
          <form
            className="custom-decision-form"
            onSubmit={(event) => {
              event.preventDefault()
              submitCustom()
            }}
          >
            <label htmlFor="custom-decision">此刻，你真正想怎么做？</label>
            <textarea
              id="custom-decision"
              autoFocus
              value={customText}
              onChange={(event) => setCustomText(event.target.value.slice(0, 120))}
              placeholder="例如：我不辞职，也不留下。我申请三个月假期，先去看看外面的世界。"
              rows={3}
              maxLength={120}
            />
            <div>
              <span>{customText.length}/120</span>
              <button type="button" onClick={() => setCustomOpen(false)}>取消</button>
              <button type="submit" disabled={customText.trim().length < 2}>就这样决定</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
