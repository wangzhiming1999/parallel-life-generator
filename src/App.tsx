import { useCallback, useEffect, useRef, useState } from 'react'
import { stagger } from 'animejs'
import { useBranch } from './hooks/useBranch'
import { useAmbientMusic, AmbientMusicButton } from './hooks/useAmbientMusic'
import { useAnime, useAnimeChildren } from './hooks/useMotion'
import ParticleBackground from './components/ParticleBackground'
import MarqueeText from './components/MarqueeText'
import BreathingDots from './components/BreathingDots'
import ChoiceZone from './components/ChoiceZone'
import DestinationDialog from './components/DestinationDialog'
import InsightCard from './components/InsightCard'
import LifeEntry from './components/LifeEntry'
import PulseGrid from './components/PulseGrid'
import SceneProgress from './components/SceneProgress'
import TimelineMap from './components/TimelineMap'
import Toast from './components/Toast'
import { ASSUMPTION_MAX_LEN, isVagueInsight, QUICK_TAGS, TOTAL_SCENES, type BranchRunState } from './shared/protocol'
import { copyText, loadBranchRun, saveBranchRun, clearBranchRun } from './lib/storage'
import { getLifeStage, getUniversePulse, pathDistance, type LifeDimension } from './lib/universe'
import { DURATION, EASE } from './lib/motion'
import type { ArchiveResponse, PublicArchive } from './shared/archive'

type View = 'input' | 'loading' | 'story' | 'ocean'

export default function App() {
  const [view, setView] = useState<View>('input')
  const [assumption, setAssumption] = useState('')
  const [age, setAge] = useState('')
  const [occupation, setOccupation] = useState('')
  const [personality, setPersonality] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [toast, setToast] = useState('')
  /** 刷新后可续传的存档（输入页展示） */
  const [savedRun, setSavedRun] = useState<BranchRunState | null>(null)
  /** 幕间过渡：选择后短暂淡出再进入下一幕 */
  const [transitioning, setTransitioning] = useState(false)
  /** 本次会话是否从存档恢复（影响岔路口文案） */
  const [resumed, setResumed] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [previousUniverse, setPreviousUniverse] = useState<BranchRunState | null>(null)
  const [archiveChoiceOpen, setArchiveChoiceOpen] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [caughtArchive, setCaughtArchive] = useState<PublicArchive | null>(null)
  const [oceanMessage, setOceanMessage] = useState('')
  const [publishedArchiveCode, setPublishedArchiveCode] = useState('')
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const music = useAmbientMusic()

  /**
   * 视图级入场：输入页各区块自上而下依次浮现，故事页是控制台先落位，
   * 档案海整块柔入。放在 main 上一个 hook 里按当前视图切选择器，
   * 避免给每个视图各挂一套 ref。子视图里的细节动画由各自的组件负责。
   */
  const revealSelector = view === 'input'
    ? '.memory-world--input main > *'
    : view === 'story'
      ? '.universe-console'
      : '.ocean-view > *'
  const mainRef = useAnimeChildren<HTMLElement>(
    revealSelector,
    { opacity: [0, 1], y: [10, 0], duration: DURATION.enter, delay: stagger(60), ease: EASE.outSoft },
    [view],
  )

  /** 幕间淡出/淡入：原先是内联 CSS transition，改由 anime.js 统一驱动 */
  const articleRef = useAnime<HTMLElement>(
    { opacity: transitioning ? 0 : 1, duration: DURATION.cross, ease: EASE.cross },
    [transitioning],
  )

  /**
   * 输入页主标题：字距由松到紧收拢、散焦到清晰，像从记忆里慢慢浮上来。
   * 这套手感原先只剩一份没用上的 CSS keyframes，换成 anime.js 后真正跑起来。
   * 不额外动 opacity —— 标题的淡入交给上面的视图级揭示，避免两层透明度叠加。
   */
  const titleRef = useAnimeChildren<HTMLElement>(
    'h1',
    {
      letterSpacing: ['0.3em', '0.04em'],
      filter: ['blur(4px)', 'blur(0px)'],
      duration: DURATION.title,
      ease: EASE.outSoft,
    },
    [view],
  )

  const handleRunDone = useCallback((state: BranchRunState) => {
    saveBranchRun(state)
  }, [])

  // 每幕完成即落盘，刷新后从当前岔路口恢复，进度不丢
  const handleSnapshot = useCallback((state: BranchRunState) => {
    saveBranchRun(state)
  }, [])

  const branch = useBranch({ onRunDone: handleRunDone, onSnapshot: handleSnapshot })

  // 刷新后恢复存档入口
  useEffect(() => {
    setSavedRun(loadBranchRun())
  }, [])

  const canSubmit = assumption.trim().length >= 2 && branch.phase !== 'loading' && branch.phase !== 'streaming'

  const handleSubmit = () => {
    if (!canSubmit) return
    // 与音乐启动处于同一次用户点击中，避免输入页场景 effect 立刻中断首曲。
    setView('story')
    music.start()
    clearBranchRun()
    setSavedRun(null)
    setResumed(false)
    branch.startRun({ assumption: assumption.trim(), age, occupation, personality })
  }

  // phase 变化驱动视图
  useEffect(() => {
    if (branch.phase === 'loading' || branch.phase === 'streaming' || branch.phase === 'done') setView('story')
    if (branch.phase === 'idle' && branch.error) setView('input')
  }, [branch.phase, branch.error])

  // 全程共用同一音源；终章只做轻微音量变化，不重新加载音乐。
  useEffect(() => {
    const isFinal = branch.scene === TOTAL_SCENES && branch.phase === 'done' && branch.insight
    const scene: 'input' | 'journey' | 'result' = view === 'input' ? 'input' : isFinal ? 'result' : 'journey'
    music.setScene(scene)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, branch.phase, branch.scene, branch.insight])

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(''), 2000)
  }

  const handleChoose = (choice: 0 | 1, decision?: string) => {
    if (branch.phase !== 'done' || transitioning || branch.scene >= TOTAL_SCENES) return
    setTransitioning(true)
    // 等淡出播完再换幕：时长与 DURATION.cross 对齐，留 40ms 余量避免边界抖动
    setTimeout(() => {
      branch.choose(choice, decision)
      setTransitioning(false)
    }, DURATION.cross + 40)
  }

  const handleFork = (scene: number, originalChoice: 0 | 1) => {
    const currentState: BranchRunState = {
      assumption: branch.scenes.length ? (savedRun?.assumption ?? assumption) : assumption,
      age,
      occupation,
      personality,
      scenes: branch.scenes,
      path: branch.path,
      createdAt: Date.now(),
      version: 3,
    }
    setPreviousUniverse(currentState)
    setMapOpen(false)
    setPublishedArchiveCode('')
    setResumed(false)
    branch.fork(scene, originalChoice === 0 ? 1 : 0)
  }

  const handleCopy = async () => {
    const last = branch.scenes[branch.scenes.length - 1]
    if (!last || !last.insight) return
    const full = `${branch.scenes.map((s) => s.paragraphs.join('\n\n')).join('\n\n')}\n\n「${last.insight}」\n\n—— 平行人生生成器 · 内容由AI生成，仅供娱乐`
    const ok = await copyText(full)
    showToast(ok ? '已复制整段人生' : '复制失败，请长按屏幕手动复制')
  }

  const handleAnother = () => {
    branch.reset()
    clearBranchRun()
    setSavedRun(null)
    setResumed(false)
    setPreviousUniverse(null)
    setMapOpen(false)
    setPublishedArchiveCode('')
    setView('input')
  }

  const handleResume = () => {
    if (!savedRun) return
    // 存档已完成整局 → 直接展示；未完成 → 恢复到断点
    branch.resume(savedRun)
    setResumed(true)
    setView('story')
  }

  const handleThrowToSea = async () => {
    if (!branch.insight || archiveBusy) return
    setArchiveBusy(true)
    setOceanMessage('')
    try {
      const response = await fetch('/api/archives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assumption: savedRun?.assumption ?? assumption,
          universeTitle: pulse.title,
          scenes: branch.scenes,
          path: branch.path,
          insight: branch.insight,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message || '投递失败')
      clearBranchRun()
      setArchiveChoiceOpen(false)
      setPublishedArchiveCode(payload.data.archiveCode)
      showToast(`档案 ${payload.data.archiveCode} 已经开始漂流`)
    } catch (error) {
      setOceanMessage(error instanceof Error ? error.message : '海面起了风浪，请稍后再试')
    } finally {
      setArchiveBusy(false)
    }
  }

  const handleLaunchToGalaxy = () => {
    if (!window.confirm('发射后不会上传、不会保存，也无法找回。确认让这段人生消失在银河里吗？')) return
    setArchiveChoiceOpen(false)
    handleAnother()
    showToast('档案已化作一颗遥远的星')
  }

  const handleSalvage = async () => {
    setView('ocean')
    setArchiveBusy(true)
    setOceanMessage('正在听海浪里的声音…')
    try {
      const response = await fetch('/api/archives')
      const payload = await response.json() as ArchiveResponse & { error?: { message?: string } }
      if (!response.ok) throw new Error(payload.error?.message || '暂时没有捞到档案')
      setCaughtArchive(payload.data)
      setOceanMessage('')
    } catch (error) {
      // 捞不到就直接回主界面提示，不留在空荡的档案海页面
      setCaughtArchive(null)
      setView('input')
      showToast(error instanceof Error ? error.message : '暂时没有捞到档案，稍后再试试')
    } finally {
      setArchiveBusy(false)
    }
  }

  const isFinalDone = branch.scene === TOTAL_SCENES && branch.phase === 'done' && branch.insight
  const doneScenes = branch.scenes.filter((s) => s.scene < branch.scene)
  const pulse = getUniversePulse(branch.path)
  const previousPulse = previousUniverse ? getUniversePulse(previousUniverse.path) : null
  const dimensions = Object.entries(pulse.values) as Array<[LifeDimension, number]>

  // 新一幕与流式正文增长时始终跟随最新内容；打开星图时暂停，避免抢走历史浏览位置。
  useEffect(() => {
    if (view !== 'story' || mapOpen || transitioning || branch.phase === 'idle') return
    const frame = requestAnimationFrame(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: branch.phase === 'streaming' ? 'auto' : 'smooth',
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [view, mapOpen, transitioning, branch.phase, branch.scene, branch.paragraphs, branch.choices, branch.insight])

  return (
    <div className={`memory-world memory-world--${view} min-h-dvh flex flex-col relative`}>
      <ParticleBackground />
      <main ref={mainRef} className="flex-1 w-full max-w-[640px] mx-auto px-5 py-10 relative" style={{ zIndex: 1 }}>
        {view === 'input' && (
          <>
            {savedRun && (
              <section className="mb-8">
                <p className="text-[13px] mb-3" style={{ color: 'var(--color-ink-secondary)' }}>
                  你有一段人生走到一半：
                </p>
                <button
                  onClick={handleResume}
                  className="insight-card w-full text-left cursor-pointer"
                >
                  <span className="insight-mark">✶</span>
                  <p className="font-medium text-[18px] m-0" style={{ color: 'var(--color-ink)' }}>
                    {savedRun.assumption}
                  </p>
                  <p className="text-[13px] mt-2 mb-0" style={{ color: 'var(--color-ink-secondary)' }}>
                    第 {savedRun.scenes.length} 幕 · 点击继续往下走
                  </p>
                </button>
              </section>
            )}
            <header ref={titleRef} className="text-center mb-10">
              <p className="archive-eyebrow">MEMORY ARCHIVE · 1999—∞</p>
              <h1 className="text-[26px] font-medium m-0" style={{ color: 'var(--color-ink)', lineHeight: 1.4 }}>
                平行人生档案馆
              </h1>
              <p className="text-[14px] mt-2 mb-0" style={{ color: 'var(--color-ink-secondary)' }}>
                写下你的「如果」，在每个岔路口做出选择
              </p>
            </header>

            <button onClick={handleSalvage} className="salvage-entry">
              <span>≈</span>
              <div><strong>去档案海打捞</strong><small>读一段陌生人的平行人生</small></div>
              <em>去看看</em>
            </button>

            <div
              className="rounded-xl p-4 mb-5"
              style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-line)' }}
            >
              <textarea
                value={assumption}
                onChange={(e) => setAssumption(e.target.value.slice(0, ASSUMPTION_MAX_LEN))}
                placeholder="比如：如果当年毕业留在了北京"
                rows={3}
                maxLength={ASSUMPTION_MAX_LEN}
                className="w-full bg-transparent outline-none resize-none text-[16px]"
                style={{ color: 'var(--color-ink)', caretColor: 'var(--color-primary-strong)' }}
              />
              <div className="text-right text-[12px]" style={{ color: 'var(--color-ink-secondary)' }}>
                {assumption.length}/{ASSUMPTION_MAX_LEN}
              </div>
            </div>

            <div className="tag-scroll flex gap-2 overflow-x-auto pb-1 mb-5">
              {QUICK_TAGS.map((tag) => (
                <button key={tag} className="tag" onClick={() => setAssumption(tag)}>
                  {tag}
                </button>
              ))}
            </div>

            <div className="mb-6">
              <button
                onClick={() => setDetailOpen((v) => !v)}
                className="text-[14px] cursor-pointer bg-transparent border-0 p-0"
                style={{ color: 'var(--color-ink-secondary)' }}
              >
                {detailOpen ? '收起补充细节' : '补充更多细节（可选）'}
              </button>
              {detailOpen && (
                <div className="grid grid-cols-1 gap-3 mt-3">
                  <input
                    value={age}
                    onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="年龄"
                    inputMode="numeric"
                    className="rounded-lg px-3 py-2.5 text-[15px] outline-none"
                    style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-line)', color: 'var(--color-ink)' }}
                  />
                  <input
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value.slice(0, 20))}
                    placeholder="职业，如：程序员、老师"
                    className="rounded-lg px-3 py-2.5 text-[15px] outline-none"
                    style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-line)', color: 'var(--color-ink)' }}
                  />
                  <input
                    value={personality}
                    onChange={(e) => setPersonality(e.target.value.slice(0, 20))}
                    placeholder="性格，如：内敛、爱冒险"
                    className="rounded-lg px-3 py-2.5 text-[15px] outline-none"
                    style={{ background: 'var(--color-card)', border: '0.5px solid var(--color-line)', color: 'var(--color-ink)' }}
                  />
                </div>
              )}
            </div>

            {branch.error && (
              <p className="text-[14px] text-center mb-4" style={{ color: 'var(--color-primary-strong)' }}>
                {branch.error}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full h-[52px] rounded-full text-[17px] font-medium"
              style={{
                background: canSubmit ? 'var(--color-primary)' : 'var(--color-line)',
                color: canSubmit ? 'var(--color-btn-text)' : 'var(--color-ink-secondary)',
                opacity: canSubmit ? 1 : 0.6,
                border: 'none',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
              }}
            >
              开启平行人生
            </button>
          </>
        )}

        {view === 'story' && (
          <article ref={articleRef}>
            <header className="universe-console mb-8" aria-label="当前平行宇宙状态">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="universe-kicker">宇宙编号 · {branch.path.map((step) => step.choice === 0 ? 'A' : 'B').join('').slice(-6) || '起点'}</p>
                  <h1 className="universe-title">{pulse.title}</h1>
                  <p className="universe-stage">{getLifeStage(branch.scene)} · 第 {branch.scene}/{TOTAL_SCENES} 幕</p>
                </div>
                <button className="map-button" onClick={() => setMapOpen((open) => !open)} aria-expanded={mapOpen}>
                  {mapOpen ? '收起星图' : '打开星图'}
                </button>
              </div>
              <PulseGrid dimensions={dimensions} />
              {pulse.fragments.length > 0 && (
                <p className="fragment-line">已拾取 {pulse.fragments.length}/6 枚时间碎片 · {pulse.fragments.at(-1)}</p>
              )}
            </header>

            {mapOpen && (
              <TimelineMap path={branch.path} scenes={branch.scenes} onFork={handleFork} />
            )}

            {/* 走过的幕（紧凑回显） */}
            {doneScenes.map((s) => {
              const step = branch.path.find((item) => item.scene === s.scene)
              const decision = step?.decision ?? (step ? s.choices?.[step.choice] : undefined)
              return (
                <LifeEntry
                  key={s.scene}
                  scene={s.scene}
                  paragraphs={s.paragraphs}
                  decision={decision}
                />
              )
            })}

            {/* 当前幕（走马灯逐字点亮） */}
            <section className="mb-8">
              <p className="text-[12px] tracking-widest mb-2" style={{ color: 'var(--color-primary-strong)' }}>
                {branch.scene === TOTAL_SCENES ? '人生终章' : `人生片段 ${String(branch.scene).padStart(2, '0')} · ${getLifeStage(branch.scene)}`}
              </p>
              {branch.paragraphs.map((p, i) => (
                <p key={`${branch.scene}-${i}`} className="m-0 text-[16px]" style={{ color: 'var(--color-ink)' }}>
                  <MarqueeText text={p} active={branch.phase === 'streaming'} />
                </p>
              ))}
              {branch.insight && (
                <InsightCard text={branch.insight} streaming={branch.phase === 'streaming'} />
              )}
            </section>

            {/* 幕尾交互区 */}
            {branch.phase === 'done' && branch.choices && !isFinalDone && (
              <ChoiceZone choices={branch.choices} resumed={resumed} onChoose={handleChoose} />
            )}

            {/* 死寂兜底：done 但既无选项也无结局（异常态），给重试出路 */}
            {branch.phase === 'done' && !branch.choices && !isFinalDone && (
              <div className="text-center mb-10">
                <p className="text-[14px] mb-4" style={{ color: 'var(--color-ink-secondary)' }}>
                  这一段人生走完了，但岔路口没亮起来。
                </p>
                <button
                  onClick={handleAnother}
                  className="text-[14px] bg-transparent cursor-pointer"
                  style={{ color: 'var(--color-primary-strong)', border: 'none' }}
                >
                  重新开启一段人生
                </button>
              </div>
            )}

            {branch.phase !== 'done' && (
              <div className="flex items-center justify-center gap-2.5 h-[48px] mb-12" aria-live="polite">
                <BreathingDots />
                <span className="text-[14px]" style={{ color: 'var(--color-ink-secondary)' }}>
                  {branch.phase === 'loading' ? '正在翻开下一页…' : '正在书写这段人生…'}
                </span>
              </div>
            )}

            {isFinalDone && (
              <div className="mb-12">
                {previousPulse && previousUniverse && (
                  <section className="universe-compare">
                    <p>你已经抵达第二个结局</p>
                    <h2>{previousPulse.title} <span>与</span> {pulse.title}</h2>
                    <strong>{pathDistance(previousUniverse.path, branch.path)} 个选择，让两段人生走向不同的地方</strong>
                  </section>
                )}
                <div className="flex gap-3">
                <button
                  onClick={handleCopy}
                  className="flex-1 h-[48px] rounded-full text-[16px] font-medium"
                  style={{
                    background: 'var(--color-primary)',
                    color: 'var(--color-btn-text)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  复制这段人生
                </button>
                <button
                  onClick={() => {
                    const lastStep = branch.path[branch.path.length - 1]
                    if (lastStep) handleFork(lastStep.scene, lastStep.choice)
                  }}
                  className="flex-1 h-[48px] rounded-full text-[16px]"
                  style={{
                    background: 'transparent',
                    color: 'var(--color-ink)',
                    border: '0.5px solid var(--color-line)',
                    cursor: 'pointer',
                  }}
                >
                  回到上个岔路
                </button>
                </div>
                <button onClick={handleAnother} className="new-life-button">开启全新假设</button>
                <button
                  onClick={() => setArchiveChoiceOpen(true)}
                  className="archive-destination-button"
                  disabled={Boolean(publishedArchiveCode)}
                >
                  {publishedArchiveCode ? `${publishedArchiveCode} · 已在海上漂流` : '决定这份档案的归宿'}
                </button>
              </div>
            )}

            {/* 幕进度指示：18 幕只渲染当前幕前后各 4 幕，避免整条塞满屏幕 */}
            <SceneProgress total={TOTAL_SCENES} scene={branch.scene} />
          </article>
        )}

        {view === 'ocean' && (
          <section className="ocean-view">
            <button className="ocean-back" onClick={() => setView('input')}>← 返回档案馆</button>
            <header><span>≈</span><p>档案海</p><h1>{caughtArchive ? caughtArchive.universeTitle : '听一听陌生人的人生'}</h1></header>
            {archiveBusy && <p className="ocean-status" aria-live="polite">{oceanMessage}</p>}
            {!archiveBusy && !caughtArchive && <div className="ocean-empty"><p>{oceanMessage}</p><button onClick={handleSalvage}>再撒一次网</button></div>}
            {caughtArchive && (
              <article className="caught-archive">
                <p className="archive-code">{caughtArchive.archiveCode} · 被打捞 {caughtArchive.salvageCount} 次</p>
                <h2>{caughtArchive.assumption}</h2>
                {caughtArchive.scenes.map((scene) => {
                  const step = caughtArchive.path.find((item) => item.scene === scene.scene)
                  const decision = step?.decision ?? (step ? scene.choices?.[step.choice] : undefined)
                  return (
                    <div key={scene.scene} className="life-entry">
                      <section>
                        <small>{scene.scene === TOTAL_SCENES ? '人生终章' : `人生片段 ${String(scene.scene).padStart(2, '0')} · ${getLifeStage(scene.scene)}`}</small>
                        {scene.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                      </section>
                      {decision && <div className="decision-bridge"><span>在这个岔路，你选择了</span><strong>{decision}</strong></div>}
                    </div>
                  )
                })}
                {!isVagueInsight(caughtArchive.insight) && <blockquote>{caughtArchive.insight}</blockquote>}
                <button onClick={handleSalvage}>把它放回海里，再捞一份</button>
              </article>
            )}
          </section>
        )}
      </main>

      <footer className="pb-6 pt-2 text-center">
        <p className="text-[12px] m-0" style={{ color: 'var(--color-ink-secondary)', opacity: 0.75 }}>
          内容由AI生成 · 仅供娱乐 · 不构成任何人生建议 · 平行人生生成器
        </p>
      </footer>

      {toast && <Toast message={toast} />}

      <AmbientMusicButton enabled={music.enabled} onToggle={music.toggle} />

      {archiveChoiceOpen && (
        <DestinationDialog
          busy={archiveBusy}
          message={oceanMessage}
          onClose={() => setArchiveChoiceOpen(false)}
          onThrowToSea={handleThrowToSea}
          onLaunchToGalaxy={handleLaunchToGalaxy}
        />
      )}
    </div>
  )
}
