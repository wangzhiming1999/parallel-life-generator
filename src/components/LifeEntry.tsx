import { useEnter } from '../hooks/useMotion'
import { DURATION, EASE } from '../lib/motion'
import { getLifeStage } from '../lib/universe'

interface LifeEntryProps {
  scene: number
  paragraphs: string[]
  decision?: string
}

/**
 * 走过的幕（紧凑回显）。
 *
 * 抽成组件是为了拿到「挂载」这个时机：每幕归档时新组件挂载 → anime.js 播放一次
 * 淡入上浮，用户能看清刚才那段人生被折叠到了哪里。放在父组件的 map 里就只能在
 * 首次渲染统一播一次，后续新增的幕不会动。
 */
export default function LifeEntry({ scene, paragraphs, decision }: LifeEntryProps) {
  const ref = useEnter<HTMLDivElement>({
    opacity: [0, 1],
    y: [10, 0],
    duration: DURATION.enter,
    ease: EASE.outSoft,
  })

  return (
    <div ref={ref} className="life-entry">
      <section className="mb-6 done-scene">
        <p className="text-[11px] tracking-widest mb-1.5" style={{ color: 'var(--color-ink-secondary)', opacity: 0.6 }}>
          人生片段 {String(scene).padStart(2, '0')} · {getLifeStage(scene)}
        </p>
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="para m-0 text-[14.5px] leading-[1.75]" style={{ color: 'var(--color-ink-secondary)' }}>
            {paragraph}
          </p>
        ))}
      </section>
      {decision && (
        <div className="decision-bridge">
          <span>你的决定</span>
          <strong>{decision}</strong>
        </div>
      )}
    </div>
  )
}
