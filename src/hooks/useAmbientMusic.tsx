import { useCallback, useEffect, useRef, useState } from 'react'

export type AmbientScene = 'input' | 'journey' | 'result'

/**
 * 渐进式背景乐（v2）：
 * 全程只播一首主干曲（《Ambient Piano》），不在生成状态或幕次变化时替换音源。
 * 结局只轻微调整音量，避免远程音频重新加载造成停顿。
 * 曲目均 Pixabay License（免费商用、免署名），CDN 支持跨域与 Range。
 */
const JOURNEY_TRACK = { src: 'https://cdn.pixabay.com/audio/2021/11/13/audio_cb4f1212a9.mp3', name: 'Ambient Piano' }

export function trackForAmbientScene(_scene: AmbientScene): string {
  return JOURNEY_TRACK.src
}

export function ambientSceneForLife(_scene: number, isFinal = false): AmbientScene {
  if (isFinal) return 'result'
  return 'journey'
}

// 阅读过程中保持稳定音量；每幕重新渐变会被听成忽大忽小或断续。
const JOURNEY_VOLUME = 0.28
const FINAL_VOLUME = 0.3
const FADE_MS = 2500 // 拉长淡入淡出：渐进感的另一半来自慢过渡

export function journeyVolumeForScene(_scene: number): number {
  return JOURNEY_VOLUME
}

/**
 * 渐进式背景乐 hook：
 * - 默认关闭（浏览器自动播放策略要求用户手势后才能出声）
 * - 单 <audio> 复用；主干曲全程不换 src，只做音量渐变
 * - iOS Safari / 微信内核兼容：用 audio.play() Promise 捕获中断异常
 */
export function useAmbientMusic() {
  const [enabled, setEnabled] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sceneRef = useRef<AmbientScene>('input')
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // 记录当前生效的 src（el.src 会变成 blob 绝对地址，用 includes 判断不可靠）
  const currentSrcRef = useRef<string>('')

  const getAudio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      const el = new Audio()
      el.loop = true
      el.preload = 'none'
      el.volume = 0
      audioRef.current = el
    }
    return audioRef.current
  }, [])

  /** 音量渐变到目标值（线性插值，慢过渡） */
  const fadeTo = useCallback((target: number, onDone?: () => void) => {
    const el = getAudio()
    if (fadeTimerRef.current) clearInterval(fadeTimerRef.current)
    const stepInterval = 50
    const delta = (target - el.volume) / (FADE_MS / stepInterval)
    fadeTimerRef.current = setInterval(() => {
      const next = el.volume + delta
      const reached = delta >= 0 ? next >= target : next <= target
      el.volume = Math.max(0, Math.min(target, reached ? target : next))
      if (reached) {
        if (fadeTimerRef.current) clearInterval(fadeTimerRef.current)
        fadeTimerRef.current = null
        onDone?.()
      }
    }, stepInterval)
  }, [getAudio])

  /** 播放指定场景（已开启时）。所有场景共用同一音源，只调整音量。 */
  const playScene = useCallback(
    (scene: AmbientScene) => {
      const el = getAudio()
      const targetSrc = trackForAmbientScene(scene)
      if (currentSrcRef.current === targetSrc) {
        fadeTo(scene === 'result' ? FINAL_VOLUME : JOURNEY_VOLUME)
        return
      }
      currentSrcRef.current = targetSrc
      el.src = targetSrc
      el.volume = 0
      el.play().then(() => {
        fadeTo(scene === 'result' ? FINAL_VOLUME : JOURNEY_VOLUME)
      }).catch(() => {
        /* 用户手势前播放被拦截，静默失败 */
      })
    },
    [fadeTo, getAudio],
  )

  const setScene = useCallback(
    (scene: AmbientScene) => {
      if (sceneRef.current === scene) return
      sceneRef.current = scene
      if (enabled) playScene(scene)
    },
    [enabled, playScene],
  )

  const toggle = useCallback(() => {
    const el = getAudio()
    if (enabled) {
      fadeTo(0, () => {
        el.pause()
      })
      setEnabled(false)
    } else {
      // 用户手势内：直接播当前场景曲目并淡入
      const targetSrc = trackForAmbientScene(sceneRef.current)
      currentSrcRef.current = targetSrc
      el.src = targetSrc
      el.volume = 0
      el.play()
        .then(() => fadeTo(sceneRef.current === 'result' ? FINAL_VOLUME : journeyVolumeForScene(1)))
        .catch(() => {
          /* 极旧内核不支持，静默失败 */
        })
      setEnabled(true)
    }
  }, [enabled, fadeTo, getAudio])

  /** 必须直接从点击事件调用，借用户手势通过浏览器的自动播放限制。 */
  const start = useCallback(() => {
    const el = getAudio()
    sceneRef.current = 'journey'
    currentSrcRef.current = JOURNEY_TRACK.src
    el.src = JOURNEY_TRACK.src
    el.volume = 0
    setEnabled(true)
    void el.play()
      .then(() => fadeTo(journeyVolumeForScene(1)))
      .catch(() => setEnabled(false))
  }, [fadeTo, getAudio])

  useEffect(
    () => () => {
      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current)
      audioRef.current?.pause()
      audioRef.current = null
    },
    [],
  )

  return { enabled, toggle, start, setScene }
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
