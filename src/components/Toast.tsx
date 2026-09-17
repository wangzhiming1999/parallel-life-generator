import { useEnter } from '../hooks/useMotion'
import { DURATION, EASE } from '../lib/motion'

interface ToastProps {
  message: string
}

/**
 * 轻提示。父组件用条件挂载触发入场（不是切换文案——文案变化不会重播动画）。
 * 居中改成 flex 容器而不是 `-translate-x-1/2`：anime.js 动画 transform 时会与
 * Tailwind 的 translate 类争抢同一个属性，分离后两边互不干扰。
 */
export default function Toast({ message }: ToastProps) {
  const ref = useEnter<HTMLDivElement>({
    opacity: [0, 1],
    y: [14, 0],
    duration: DURATION.enter,
    ease: EASE.outSoft,
  })

  return (
    <div className="fixed inset-x-0 bottom-16 flex justify-center pointer-events-none" style={{ zIndex: 20 }}>
      <div
        ref={ref}
        role="status"
        className="px-4 py-2 rounded-full text-[14px]"
        style={{
          background: 'var(--color-card)',
          color: 'var(--color-ink)',
          border: '0.5px solid var(--color-line)',
        }}
      >
        {message}
      </div>
    </div>
  )
}
