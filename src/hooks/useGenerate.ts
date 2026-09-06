import { useCallback, useEffect, useRef, useState } from 'react'
import { SECTION_SEPARATOR, type StoryResult } from '../shared/protocol'

export type Phase = 'idle' | 'loading' | 'streaming' | 'done'

interface UseGenerateOptions {
  onDone?: (result: StoryResult) => void
}

// 首 token 超时 / 流中空闲超时（双计时，避免长故事被误杀）
const FIRST_TOKEN_TIMEOUT_MS = 15_000
const STREAM_IDLE_TIMEOUT_MS = 10_000

export interface GenerateState {
  phase: Phase
  error: string
  title: string
  paragraphs: string[]
  insight: string
}

export function useGenerate({ onDone }: UseGenerateOptions = {}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [paragraphs, setParagraphs] = useState<string[]>([])
  const [insight, setInsight] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const firstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (firstTimerRef.current) clearTimeout(firstTimerRef.current)
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    firstTimerRef.current = null
    idleTimerRef.current = null
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    clearTimers()
    setPhase('idle')
  }, [clearTimers])

  const reset = useCallback(() => {
    clearTimers()
    setTitle('')
    setParagraphs([])
    setInsight('')
    setError('')
    setPhase('idle')
  }, [clearTimers])

  // 直接展示一条已有结果（如 localStorage 回看），置为 done
  const showResult = useCallback((result: StoryResult) => {
    clearTimers()
    abortRef.current?.abort()
    setTitle(result.title)
    setParagraphs(result.story.split('\n').map((s) => s.trim()).filter(Boolean))
    setInsight(result.insight)
    setError('')
    setPhase('done')
  }, [clearTimers])

  useEffect(() => () => {
    abortRef.current?.abort()
    clearTimers()
  }, [clearTimers])

  const generate = useCallback(
    async (body: { assumption: string; age?: string; occupation?: string; personality?: string }) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      clearTimers()
      setTitle('')
      setParagraphs([])
      setInsight('')
      setError('')
      setPhase('loading')

      // 首 token 超时：15s 内没有任何输出则提示
      firstTimerRef.current = setTimeout(() => {
        controller.abort()
        setError('时空隧道有点拥堵，请稍后再试')
        setPhase('idle')
      }, FIRST_TOKEN_TIMEOUT_MS)

      // 流中空闲超时：每次收到数据刷新
      const resetIdle = () => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        idleTimerRef.current = setTimeout(() => {
          controller.abort()
          setError('网络不太稳定，故事没有写完，请重试')
          setPhase('idle')
        }, STREAM_IDLE_TIMEOUT_MS)
      }

      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!res.ok) {
          let msg = '时空隧道暂时失联，请稍后重试'
          try {
            const data = await res.json()
            if (data?.error) msg = data.error
          } catch { /* 忽略 */ }
          clearTimers()
          setError(msg)
          setPhase('idle')
          return
        }

        const reader = res.body?.getReader()
        if (!reader) {
          clearTimers()
          setError('当前浏览器不支持流式输出')
          setPhase('idle')
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''
        let gotFirstToken = false
        let finalText = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!gotFirstToken) {
            gotFirstToken = true
            clearTimers()
            setPhase('streaming')
          }
          resetIdle()

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          const chunk = lines.join('')
          if (!chunk) continue

          finalText += chunk
          const acc = finalText.split(SECTION_SEPARATOR)
          setTitle(acc[0]?.trim() ?? '')
          setParagraphs(
            (acc[1] ?? '')
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
          )
          setInsight(acc[2]?.trim() ?? '')
        }

        clearTimers()

        const parts = finalText.split(SECTION_SEPARATOR).map((s) => s.trim())
        const finalTitle = (parts[0] ?? '').slice(0, 20) || '平行人生'
        const finalParagraphs = (parts[1] ?? '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
        const finalInsight = parts[2] ?? ''

        setTitle(finalTitle)
        setParagraphs(finalParagraphs)
        setInsight(finalInsight)
        setPhase('done')
        onDone?.({
          title: finalTitle,
          story: finalParagraphs.join('\n\n'),
          insight: finalInsight,
          createdAt: Date.now(),
          version: 1,
        })
      } catch (e) {
        clearTimers()
        if (e instanceof DOMException && e.name === 'AbortError') {
          return
        }
        setError('网络不太稳定，请稍后重试')
        setPhase('idle')
      }
    },
    [clearTimers, onDone],
  )

  return { phase, error, title, paragraphs, insight, generate, cancel, reset, showResult }
}
