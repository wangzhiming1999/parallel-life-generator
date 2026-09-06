import { useCallback, useEffect, useRef, useState } from 'react'

export type AmbientScene = 'input' | 'generating' | 'result'

/**
 * 生成式环境音（Web Audio 合成，零音频资源）：
 * - input：稀疏风铃拨音（五声音阶随机），安静铺垫
 * - generating：缓慢上行琶音，营造"穿越中"的推进感
 * - result：温暖和声垫（长音 pad），衬托阅读情绪
 *
 * 浏览器自动播放限制：默认关闭，用户点击开关后才会创建/恢复 AudioContext。
 */
export function useAmbientMusic() {
  const [enabled, setEnabled] = useState(false)
  const ctxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const sceneRef = useRef<AmbientScene>('input')
  const schedulerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // pad 振荡器引用（切场景时停止）
  const padOscsRef = useRef<OscillatorNode[]>([])
  // 五声音阶（C 大调宫商角徵羽，频率 Hz）——温暖不刺耳
  const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25]

  const ensureCtx = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null
    if (!ctxRef.current) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctxRef.current = new AC()
      const master = ctxRef.current.createGain()
      master.gain.value = 0.0 // 初始静音，淡入
      master.connect(ctxRef.current.destination)
      masterGainRef.current = master
    }
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume()
    return ctxRef.current
  }, [])

  const stopPad = useCallback(() => {
    padOscsRef.current.forEach((osc) => {
      try {
        osc.stop()
      } catch {
        /* already stopped */
      }
    })
    padOscsRef.current = []
  }, [])

  /** 单颗风铃拨音：正弦 + 快 attack / 长 release */
  const pluck = useCallback((freq: number, when: number, vol: number) => {
    const ctx = ctxRef.current
    const master = masterGainRef.current
    if (!ctx || !master) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    // 泛音层：叠加一个八度以上的弱音，更像风铃
    const harm = ctx.createOscillator()
    const harmGain = ctx.createGain()
    harm.type = 'sine'
    harm.frequency.value = freq * 2.01
    harmGain.gain.value = 0.18
    harm.connect(harmGain)
    harmGain.connect(gain)

    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(vol, when + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 2.2)

    osc.connect(gain)
    gain.connect(master)
    osc.start(when)
    osc.stop(when + 2.3)
    harm.start(when)
    harm.stop(when + 2.3)
  }, [])

  /** 和声垫：两三个 detune 的三角波长音，缓慢呼吸 */
  const startPad = useCallback((freqs: number[]) => {
    const ctx = ctxRef.current
    const master = masterGainRef.current
    if (!ctx || !master) return
    stopPad()
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const lfo = ctx.createOscillator()
      const lfoGain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = f
      osc.detune.value = (i - 1) * 6 // 轻微失谐制造宽度
      gain.gain.value = 0.05
      // LFO 调制音量，呼吸感
      lfo.frequency.value = 0.08 + i * 0.03
      lfoGain.gain.value = 0.025
      lfo.connect(lfoGain)
      lfoGain.connect(gain.gain)
      osc.connect(gain)
      gain.connect(master)
      osc.start()
      lfo.start()
      padOscsRef.current.push(osc, lfo)
    })
  }, [stopPad])

  /** 按场景调度音符 */
  const scheduleScene = useCallback(
    (scene: AmbientScene) => {
      if (schedulerTimerRef.current) {
        clearInterval(schedulerTimerRef.current)
        schedulerTimerRef.current = null
      }
      const ctx = ctxRef.current
      if (!ctx) return
      stopPad()

      if (scene === 'input') {
        // 稀疏风铃：每 2-4 秒随机一颗
        const tick = () => {
          const now = ctx.currentTime
          pluck(PENTA[Math.floor(Math.random() * PENTA.length)], now, 0.12)
          if (Math.random() < 0.3) pluck(PENTA[Math.floor(Math.random() * PENTA.length)], now + 0.4, 0.07)
        }
        tick()
        schedulerTimerRef.current = setInterval(tick, 2200 + Math.random() * 1600)
      } else if (scene === 'generating') {
        // 上行琶音循环：宫→角→徵→宫(高)，推进感
        const seq = [0, 2, 3, 5]
        let step = 0
        const tick = () => {
          pluck(PENTA[seq[step % seq.length]], ctx.currentTime, 0.1)
          step++
        }
        tick()
        schedulerTimerRef.current = setInterval(tick, 900)
      } else {
        // 结果页：C+G+E 和声垫，温暖长音
        startPad([130.81, 196.0, 329.63])
      }
    },
    [pluck, startPad, stopPad],
  )

  /** 切换场景（已开启时立即换氛围） */
  const setScene = useCallback(
    (scene: AmbientScene) => {
      sceneRef.current = scene
      if (enabled && ctxRef.current) scheduleScene(scene)
    },
    [enabled, scheduleScene],
  )

  const toggle = useCallback(() => {
    if (enabled) {
      // 关闭：淡出并停调度
      const master = masterGainRef.current
      const ctx = ctxRef.current
      if (master && ctx) {
        master.gain.cancelScheduledValues(ctx.currentTime)
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.3)
      }
      if (schedulerTimerRef.current) {
        clearInterval(schedulerTimerRef.current)
        schedulerTimerRef.current = null
      }
      stopPad()
      setEnabled(false)
    } else {
      const ctx = ensureCtx()
      const master = masterGainRef.current
      if (!ctx || !master) return
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.8) // 淡入
      setEnabled(true)
      scheduleScene(sceneRef.current)
    }
  }, [enabled, ensureCtx, scheduleScene, stopPad])

  useEffect(
    () => () => {
      if (schedulerTimerRef.current) clearInterval(schedulerTimerRef.current)
      stopPad()
      void ctxRef.current?.close()
    },
    [stopPad],
  )

  return { enabled, toggle, setScene }
}

/** 右下角音乐开关按钮（固定悬浮） */
export function AmbientMusicButton({
  enabled,
  onToggle,
}: {
  enabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      aria-label={enabled ? '关闭背景音乐' : '开启背景音乐'}
      className="fixed bottom-5 right-5 w-11 h-11 rounded-full flex items-center justify-center text-[18px] transition-opacity hover:opacity-80"
      style={{
        background: 'var(--color-card)',
        border: '0.5px solid var(--color-line)',
        color: enabled ? 'var(--color-primary-strong)' : 'var(--color-ink-secondary)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
        cursor: 'pointer',
        zIndex: 20,
      }}
    >
      {enabled ? '♪' : '♪̶'}
    </button>
  )
}
