import { stagger } from 'animejs'
import { useAnimeChildren, useEnter } from '../hooks/useMotion'
import { DURATION, EASE } from '../lib/motion'
import type { DecisionStep, SceneData } from '../shared/protocol'

interface TimelineMapProps {
  path: DecisionStep[]
  scenes: SceneData[]
  onFork: (scene: number, originalChoice: 0 | 1) => void
}

/**
 * 世界线星图：点击走过的节点即可改选，从那里长出另一条世界线。
 * 展开时面板自上而下柔入，节点自左向右依次落位——方向感对应「世界线在生长」。
 */
export default function TimelineMap({ path, scenes, onFork }: TimelineMapProps) {
  const panelRef = useEnter<HTMLElement>({
    opacity: [0, 1],
    y: [-8, 0],
    duration: DURATION.quick,
    ease: EASE.outSoft,
  })

  const nodesRef = useAnimeChildren<HTMLDivElement>('.timeline-nodes > *', {
    opacity: [0, 1],
    x: [-10, 0],
    duration: DURATION.enter,
    delay: stagger(45),
    ease: EASE.outSoft,
  })

  const possibilities = Math.max(1, 2 ** Math.min(path.length, 17)).toLocaleString()

  return (
    <section ref={panelRef} className="timeline-map mb-8" aria-label="世界线星图">
      <div className="timeline-heading">
        <div><strong>你的世界线</strong><span>点击已走过的节点，改选一次</span></div>
        <span>{possibilities} 种可能</span>
      </div>
      <div ref={nodesRef} className="timeline-nodes">
        {path.map((step) => {
          const scene = scenes.find((item) => item.scene === step.scene)
          return (
            <button key={step.scene} onClick={() => onFork(step.scene, step.choice)} title="从这里进入另一条世界线">
              <span>{step.scene}</span>
              <small>{step.decision ?? scene?.choices?.[step.choice] ?? (step.choice === 0 ? '选择 A' : '选择 B')}</small>
              <em>改选</em>
            </button>
          )
        })}
        {path.length === 0 && <p>做出第一个选择后，世界线会从这里生长。</p>}
      </div>
    </section>
  )
}
