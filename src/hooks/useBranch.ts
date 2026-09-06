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
  /** 任一幕完成后的最新快照（用于每幕落盘，断点续传不失进度） */
  onSnapshot?: (state: BranchRunState) => void
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

export function useBranch({ onSceneDone, onRunDone, onSnapshot }: UseBranchOptions = {}) {
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
  /** requestScene 自引用（递归自动重试用，避免 useCallback 捕获自身） */
  const selfRef = useRef<((scene: number, history: Array<{ scene: number; choice: 0 | 1 }>, retried?: boolean) => Promise<void>) | null>(null)

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
    if (idleTimerRef.current) clearInterval(idleTimerRef.current)
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

  /** 请求一幕（内部通用）。autoRetryUsed 防止无限重试 */
  const requestScene = useCallback(
    async (targetScene: number, history: Array<{ scene: number; choice: 0 | 1 }>, autoRetryUsed = false) => {
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

      // 空闲超时：改为时间戳检查 + 定时器兜底轮询。
      // 旧实现（每次收 chunk 都 clearTimeout+重设 setTimeout）在浏览器后台标签页
      // 定时器被节流时会误判超时；新实现只有当真实静默间隔超过阈值时才 abort。
      // 流式轮询期间的 abort 会被 catch 捕获，timer 已设置好 error/phase，catch 直接 return。
      let lastChunkAt = Date.now()
      const idlePoll = setInterval(() => {
        if (Date.now() - lastChunkAt > STREAM_IDLE_TIMEOUT_MS) {
          clearInterval(idlePoll)
          controller.abort()
          setError('网络不太稳定，故事没有写完，请重试')
          setPhase('idle')
        }
      }, 2_000)
      idleTimerRef.current = idlePoll

      const resetIdle = () => {
        lastChunkAt = Date.now()
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

        // 流结束：刷出 buffer 残留（最后一段通常不带换行，不 flush 会丢失
        // 【选项B】后的内容 → choiceB 为空 → choices=null → 死寂兜底页）
        buffer += decoder.decode()
        finalText += buffer
        buffer = ''

        clearTimers()
        const acc = parseSceneText(finalText)

        if (!acc.paragraphs.length) {
          setError('这一幕没写出来，请重试')
          setPhase('idle')
          return
        }

        // 非结局幕必须有选项。流提前中断（正文有了但【选项A/B】没出来）时不归档，
        // 自动重试一次：对用户表现为「岔路口晚几秒亮起」，而不是死寂兜底页
        const incomplete = targetScene < TOTAL_SCENES && !acc.choices
        if (incomplete && !autoRetryUsed) {
          void selfRef.current?.(targetScene, history, true)
          return
        }
        if (incomplete) {
          setError('岔路口没亮起来，请重试这一幕')
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

        // 每幕完成都落盘快照（含 choices），刷新后可从当前幕的岔路口恢复
        onSnapshot?.({
          assumption: ctx.assumption,
          age: ctx.age,
          occupation: ctx.occupation,
          personality: ctx.personality,
          scenes: nextScenes,
          path: ctx.path,
          createdAt: Date.now(),
          version: 2,
        })

        // 结局幕：额外触发整局完成
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
        // AbortError 可能来自：用户主动 cancel/reset、首 token 超时、流中空闲超时。
        // 超时场景的 timer 回调已先设置好 error + phase('idle')，read 被中断后才抛出
        // AbortError 走到这里——保持 timer 设定的状态即可，不重复归档也不静默吞掉。
        // 其他网络错误（连接中断等）明确提示，绝不把半截内容静默归档成死寂页。
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError('网络不太稳定，请稍后重试')
        setPhase('idle')
      }
    },
    [clearTimers, onSceneDone, onRunDone, onSnapshot],
  )
  // 挂到 ref 上，供流中断时的递归自动重试使用（useEffect 中赋值，避免 render 期间碰 ref）
  useEffect(() => {
    selfRef.current = requestScene
  }, [requestScene])

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
      // 恢复岔路口选项：老存档可能缺 choices 字段，为非结局幕补一个安全提示选项
      if (lastScene.scene < TOTAL_SCENES && !lastScene.choices) {
        setChoices(['继续走这条路', '换一条路试试'])
      } else {
        setChoices(lastScene.choices)
      }
      setInsight(lastScene.insight ?? '')
    }
    setPhase('done')
  }, [clearTimers])

  return {
    phase, error, paragraphs, choices, insight, scenes, path, scene: sceneNum,
    startRun, choose, resume, cancel, reset,
  }
}
