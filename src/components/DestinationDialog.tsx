import { stagger } from 'animejs'
import { useAnimeChildren, useEnter } from '../hooks/useMotion'
import { DURATION, EASE } from '../lib/motion'

interface DestinationDialogProps {
  busy: boolean
  message: string
  onClose: () => void
  onThrowToSea: () => void
  onLaunchToGalaxy: () => void
}

/**
 * 「这份人生去哪里」的归宿弹窗（结局收束动作，值得一段完整动效）。
 * 遮罩淡入 → 弹窗轻微放大落位 → 两个去向依次浮现。
 */
export default function DestinationDialog({
  busy,
  message,
  onClose,
  onThrowToSea,
  onLaunchToGalaxy,
}: DestinationDialogProps) {
  const backdropRef = useEnter<HTMLDivElement>({
    opacity: [0, 1],
    duration: DURATION.enter,
    ease: EASE.out,
  })

  const dialogRef = useEnter<HTMLElement>({
    opacity: [0, 1],
    scale: [0.94, 1],
    y: [12, 0],
    duration: DURATION.card,
    ease: EASE.outSoft,
  })

  const optionsRef = useAnimeChildren<HTMLDivElement>('.destination-options button', {
    opacity: [0, 1],
    y: [14, 0],
    duration: DURATION.enter,
    delay: stagger(90),
    ease: EASE.pop,
  })

  return (
    <div
      ref={backdropRef}
      className="destination-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={dialogRef}
        className="destination-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="destination-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="destination-close" onClick={onClose} aria-label="关闭">×</button>
        <p>旅程结束了</p>
        <h2 id="destination-title">这份人生，要去哪里？</h2>
        <div ref={optionsRef} className="destination-options">
          <button onClick={onThrowToSea} disabled={busy}>
            <span>≈</span><strong>丢入大海</strong><small>匿名公开保存，可能被陌生人打捞阅读</small>
          </button>
          <button onClick={onLaunchToGalaxy} disabled={busy}>
            <span>✦</span><strong>发射到银河</strong><small>不上传、不保存，离开后无法找回</small>
          </button>
        </div>
        {message && <p className="destination-message" aria-live="polite">{message}</p>}
      </section>
    </div>
  )
}
