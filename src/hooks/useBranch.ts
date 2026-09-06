import { useCallback, useEffect, useRef, useState } from 'react'
import { parseSceneText, TOTAL_SCENES, type BranchRunState, type SceneData } from '../shared/protocol'

export type Phase = 'idle' | 'loading' | 'streaming' | 'done'

// 首 token 超时（每幕独立计时）
const FIRST_TOKEN_TIMEOUT_MS = 20_000
// 流中空闲超时
const STREAM_IDLE_TIMEOUT_MS = 10_000

interface UseBranchOptions {
  onSceneDone?: (sceneData: SceneData) => void
  onRunDone?: (state: BranchRunState) => void
}

export interface BranchState {
  phase: Phase
  error: string
  /** 当前幕流式中的正文段落 */
  paragraphs: string[]
  /** 当前幕已浮现的选项（流式完成后出现） */
  choices: [string, string] | null
  /** 结局幕的感悟 */
  insight: string
  /** 已完成的幕（含当前流式幕的历史段落快照） */
  scenes: SceneData[]
  /** 已做的选择路径 */
  path: Array<{ scene: number; choice: 0 | 1 }>
  /** 当前幕序号 1-4 */
  scene: number
}

export function useBranch({ onSceneDone, onRunDone }: UseBranchOptions = {}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [paragraphs, setParagraphs] = useState<string[]>([])
  const [choices, setChoices] = useState<[string, string] | null>(null)
  const [insight, setInsight] = useState('')
  const [scenes, setScenes] = useState<SceneData[]>([])
  const [path, setPath] = useState<Array<{ scene: number; choice: 0 | 1 }>>([])
  const [sceneNum, setSceneNum] = useState(1)

  const abortRef = useRef<AbortController | null>(null)
  const firstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 运行上下文（不触发渲染）
  const ctxRef = useRef<{
    assumption: string
    age: string
    occupation: string
    personality: string
    scenes: SceneData[]
    path: Array<{ scene: number; choice: 0 | 1 }>
  }>({ assumption: '', age: '', occupation: '', personality: '', scenes: [], path: [] })

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
    abortRef.current?.abort()
    ctxRef.current = { assumption: '', age: '', occupation: '', personality: '', scenes: [], path: [] }
    setParagraphs([])
    setChoices(null)
    setInsight('')
    setScenes([])
    setPath([])
    setSceneNum(1)
    setError('')
    setPhase('idle')
  }, [clearTimers])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      clearTimers()
    },
    [clearTimers],
  )

  /** 请求一幕（内部通用） */
  const requestScene = useCallback(
    async (targetScene: number, history: Array<{ scene: number; choice: 0 | 1 }>) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      clearTimers()
      setParagraphs([])
      setChoices(null)
      setInsight('')
      setError('')
      setSceneNum(targetScene)
      setPhase('loading')

      firstTimerRef.current = setTimeout(() => {
        controller.abort()
        setError('时空隧道有点拥堵，请稍后再试')
        setPhase('idle')
      }, FIRST_TOKEN_TIMEOUT_MS)

      const resetIdle = () => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        idleTimerRef.current = setTimeout(() => {
          controller.abort()
          setError('网络不太稳定，故事没有写完，请重试')
          setPhase('idle')
        }, STREAM_IDLE_TIMEOUT_MS)
      }

      const ctx = ctxRef.current
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assumption: ctx.assumption,
            age: ctx.age,
            occupation: ctx.occupation,
            personality: ctx.personality,
            scene: targetScene,
            history,
          }),
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
          const acc = parseSceneText(finalText)
          if (acc.paragraphs.length) setParagraphs(acc.paragraphs)
          if (acc.choices) setChoices(acc.choices)
          if (acc.insight) setInsight(acc.insight)
        }

        clearTimers()
        const acc = parseSceneText(finalText)

        if (!acc.paragraphs.length) {
          setError('这一幕没写出来，请重试')
          setPhase('idle')
          return
        }

        const sceneData: SceneData = {
          scene: targetScene,
          paragraphs: acc.paragraphs,
          choices: targetScene < TOTAL_SCENES ? acc.choices : null,
          insight: targetScene === TOTAL_SCENES ? acc.insight : null,
        }

        // 归档该幕
        const nextScenes = [...ctx.scenes.filter((s) => s.scene !== targetScene), sceneData].sort((a, b) => a.scene - b.scene)
        ctxRef.current = { ...ctx, scenes: nextScenes }
        setScenes(nextScenes)
        setParagraphs(sceneData.paragraphs)
        setChoices(sceneData.choices)
        setInsight(sceneData.insight ?? '')
        setPhase('done')
        onSceneDone?.(sceneData)

        // 结局幕：触发整局完成
        if (targetScene === TOTAL_SCENES) {
          const runState: BranchRunState = {
            assumption: ctx.assumption,
            age: ctx.age,
            occupation: ctx.occupation,
            personality: ctx.personality,
            scenes: nextScenes,
            path: ctx.path,
            createdAt: Date.now(),
            version: 2,
          }
          onRunDone?.(runState)
        }
      } catch (e) {
        clearTimers()
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError('网络不太稳定，请稍后重试')
        setPhase('idle')
      }
    },
    [clearTimers, onSceneDone, onRunDone],
  )

  /** 开新一局：第一幕 */
  const startRun = useCallback(
    (body: { assumption: string; age?: string; occupation?: string; personality?: string }) => {
      ctxRef.current = {
        assumption: body.assumption,
        age: body.age ?? '',
        occupation: body.occupation ?? '',
        personality: body.personality ?? '',
        scenes: [],
        path: [],
      }
      setPath([])
      requestScene(1, [])
    },
    [requestScene],
  )

  /** 选了一条路：记录并请求下一幕 */
  const choose = useCallback(
    (choice: 0 | 1) => {
      const ctx = ctxRef.current
      const nextPath = [...ctx.path, { scene: sceneNum, choice }]
      ctxRef.current = { ...ctx, path: nextPath }
      setPath(nextPath)
      void requestScene(sceneNum + 1, nextPath)
    },
    [sceneNum, requestScene],
  )

  /** 从存档恢复（刷新续传）：重建上下文，停在当前幕等待用户操作 */
  const resume = useCallback((state: BranchRunState) => {
    clearTimers()
    abortRef.current?.abort()
    ctxRef.current = {
      assumption: state.assumption,
      age: state.age,
      occupation: state.occupation,
      personality: state.personality,
      scenes: state.scenes,
      path: state.path,
    }
    setScenes(state.scenes)
    setPath(state.path)
    setError('')
    const lastScene = state.scenes[state.scenes.length - 1]
    if (lastScene) {
      setSceneNum(lastScene.scene)
      setParagraphs(lastScene.paragraphs)
      setChoices(lastScene.choices)
      setInsight(lastScene.insight ?? '')
    }
    setPhase('done')
  }, [clearTimers])

  return {
    phase, error, paragraphs, choices, insight, scenes, path, scene: sceneNum,
    startRun, choose, resume, cancel, reset,
  }
}
