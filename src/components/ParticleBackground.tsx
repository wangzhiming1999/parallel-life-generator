import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  alpha: number
  phase: number
  hue: number
}

/**
 * 全屏漂浮微光粒子背景。
 * - 暖金色粒子缓慢上浮 + 呼吸闪烁，暗色模式下更明显
 * - 鼠标/触摸移动产生轻微气流扰动
 * - prefers-reduced-motion 时仅静态渲染一帧
 */
export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches

    let raf = 0
    let particles: Particle[] = []
    const pointer = { x: -9999, y: -9999 }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
    }

    const seed = () => {
      // 像旧胶片里漂浮的细尘，不做通用的星光粒子。
      const count = Math.min(65, Math.floor((window.innerWidth * window.innerHeight) / 22000))
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: 0.45 + Math.random() * 1.15,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -(0.08 + Math.random() * 0.25), // 缓慢上浮
        alpha: 0.08 + Math.random() * 0.22,
        phase: Math.random() * Math.PI * 2,
        hue: 28 + Math.random() * 8,
      }))
    }

    const drawFrame = (t: number) => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      const baseAlpha = darkMode ? 0.7 : 0.5

      for (const p of particles) {
        // 呼吸闪烁
        const twinkle = 0.6 + 0.4 * Math.sin(t / 1400 + p.phase)
        // 鼠标气流扰动：距离越近推力越大
        const dx = p.x - pointer.x
        const dy = p.y - pointer.y
        const dist2 = dx * dx + dy * dy
        if (dist2 < 120 * 120) {
          const f = (120 * 120 - dist2) / (120 * 120) * 0.6
          p.vx += (dx / Math.sqrt(dist2 + 1)) * f * 0.1
          p.vy += (dy / Math.sqrt(dist2 + 1)) * f * 0.1
        }
        // 阻尼回正
        p.vx *= 0.96
        p.vy = p.vy * 0.96 - 0.002

        p.x += p.vx
        p.y += p.vy

        // 环绕边界
        if (p.y < -10) {
          p.y = window.innerHeight + 10
          p.x = Math.random() * window.innerWidth
        }
        if (p.x < -10) p.x = window.innerWidth + 10
        if (p.x > window.innerWidth + 10) p.x = -10

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 70%, ${darkMode ? 68 : 55}%, ${p.alpha * twinkle * baseAlpha})`
        ctx.fill()
      }
    }

    const loop = (t: number) => {
      drawFrame(t)
      raf = requestAnimationFrame(loop)
    }

    const onPointer = (e: PointerEvent) => {
      pointer.x = e.clientX
      pointer.y = e.clientY
    }
    const onLeave = () => {
      pointer.x = -9999
      pointer.y = -9999
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('pointerleave', onLeave)

    if (reducedMotion) {
      drawFrame(0) // 静态一帧
    } else {
      raf = requestAnimationFrame(loop)
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}
