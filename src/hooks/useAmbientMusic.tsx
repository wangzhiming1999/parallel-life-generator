import { useCallback, useEffect, useRef, useState } from 'react'

export type AmbientScene = 'input' | 'generating' | 'result'

/**
 * 场景曲库：全部 Pixabay License（免费商用、免署名）。
 * CDN 直链已验证可跨域（Access-Control-Allow-Origin: *），支持循环与淡入淡出。
 */
const TRACKS: Record<AmbientScene, { src: string; name: string }[]> = {
  // 输入页：温柔钢琴，夜色般宁静（Forest Lullaby - Lesfm）
  input: [{ src: 'https://cdn.pixabay.com/audio/2022/05/05/audio_1395e7800f.mp3', name: 'Forest Lullaby' }],
  // 生成中：氛围电子，轻微呼吸推进感（Moment - Sascha Ende）
  generating: [{ src: 'https://cdn.pixabay.com/audio/2022/01/11/audio_b21d9d6fa6.mp3', name: 'Moment' }],
  // 结果页：极简钢琴+弦乐，温暖沉淀（Ambient Piano & Strings - Lexin_Music）
  result: [{ src: 'https://cdn.pixabay.com/audio/2021/11/13/audio_cb4f1212a9.mp3', name: 'Ambient Piano' }],
}

// 统一音量（背景乐不宜喧宾夺主）
const TARGET_VOLUME = 0.35
const FADE_MS = 1200

/**
 * 场景化歌曲背景乐：每个场景一首循环曲目，切换时交叉淡入淡出。
 * - 默认关闭（浏览器自动播放策略要求用户手势后才能出声）
 * - 单 <audio> 复用，切换 = 淡出旧曲 → 换 src → 淡入新曲
 * - iOS Safari / 微信内核兼容：用 audio.play() Promise 捕获中断异常
 */
export function useAmbientMusic() {
  const [enabled, setEnabled] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sceneRef = useRef<AmbientScene>('input')
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  /** 音量渐变到目标值 */
  const fadeTo = useCallback((target: number, onDone?: () => void) => {
    const el = getAudio()
    if (fadeTimerRef.current) clearInterval(fadeTimerRef.current)
    const step = 0.04 * (target > el.volume ? 1 : -1)
    fadeTimerRef.current = setInterval(() => {
      const next = el.volume + step
      const reached = step > 0 ? next >= target : next <= target
      el.volume = Math.max(0, Math.min(target, reached ? target : next))
      if (reached) {
        if (fadeTimerRef.current) clearInterval(fadeTimerRef.current)
        fadeTimerRef.current = null
        onDone?.()
      }
    }, FADE_MS / (TARGET_VOLUME / 0.04))
  }, [getAudio])

  /** 播放指定场景曲目（已开启时） */
  const playScene = useCallback(
    (scene: AmbientScene) => {
      const el = getAudio()
      const track = TRACKS[scene][0]
      const absoluteSrc = !el.src || !el.src.includes(track.src.split('/').pop() ?? '')
      if (absoluteSrc) {
        // 淡出 → 换曲 → 淡入
        fadeTo(0, () => {
          el.src = track.src
          el.volume = 0
          el.play().catch(() => {
            /* 用户手势前播放被拦截，静默失败 */
          })
          fadeTo(TARGET_VOLUME)
        })
      }
    },
    [fadeTo, getAudio],
  )

  const setScene = useCallback(
    (scene: AmbientScene) => {
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
      el.src = TRACKS[sceneRef.current][0].src
      el.volume = 0
      el.play()
        .then(() => fadeTo(TARGET_VOLUME))
        .catch(() => {
          /* 极旧内核不支持，静默失败 */
        })
      setEnabled(true)
    }
  }, [enabled, fadeTo, getAudio])

  useEffect(
    () => () => {
      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current)
      audioRef.current?.pause()
      audioRef.current = null
    },
    [],
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
