import { useCallback, useEffect, useRef, useState } from 'react'
import { useBranch } from './hooks/useBranch'
import { useAmbientMusic, AmbientMusicButton, type AmbientScene } from './hooks/useAmbientMusic'
import ParticleBackground from './components/ParticleBackground'
import MarqueeText from './components/MarqueeText'
import { ASSUMPTION_MAX_LEN, QUICK_TAGS, TOTAL_SCENES, type BranchRunState } from './shared/protocol'
import { copyText, loadBranchRun, saveBranchRun, clearBranchRun } from './lib/storage'
import { getLifeStage, getUniversePulse, pathDistance, type LifeDimension } from './lib/universe'
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
  const [customDecisionOpen, setCustomDecisionOpen] = useState(false)
  const [customDecision, setCustomDecision] = useState('')
  const [archiveChoiceOpen, setArchiveChoiceOpen] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [caughtArchive, setCaughtArchive] = useState<PublicArchive | null>(null)
  const [oceanMessage, setOceanMessage] = useState('')
  const [publishedArchiveCode, setPublishedArchiveCode] = useState('')
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const music = useAmbientMusic()

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

  // 背景音乐跟随场景
  useEffect(() => {
    const isFinal = branch.scene === TOTAL_SCENES && branch.phase === 'done' && branch.insight
    const scene: AmbientScene = view === 'input' ? 'input' : isFinal ? 'result' : 'generating'
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
    setTimeout(() => {
      branch.choose(choice, decision)
      setTransitioning(false)
      setCustomDecision('')
      setCustomDecisionOpen(false)
      // 选完滚动回顶部，准备读下一幕
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 600)
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
    setCustomDecision('')
    setCustomDecisionOpen(false)
    setPublishedArchiveCode('')
    setResumed(false)
    branch.fork(scene, originalChoice === 0 ? 1 : 0)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
      if (!response.ok) throw new Error(payload.error?.message || '没有捞到档案')
      setCaughtArchive(payload.data)
      setOceanMessage('')
    } catch (error) {
      setCaughtArchive(null)
      setOceanMessage(error instanceof Error ? error.message : '暂时没有捞到档案')
    } finally {
      setArchiveBusy(false)
    }
  }

  const isFinalDone = branch.scene === TOTAL_SCENES && branch.phase === 'done' && branch.insight
  const doneScenes = branch.scenes.filter((s) => s.scene < branch.scene)
  const pulse = getUniversePulse(branch.path)
  const previousPulse = previousUniverse ? getUniversePulse(previousUniverse.path) : null
  const dimensions = Object.entries(pulse.values) as Array<[LifeDimension, number]>

  return (
    <div className="min-h-dvh flex flex-col relative" style={{ background: 'var(--color-page)' }}>
      <ParticleBackground />
      <main className="flex-1 w-full max-w-[640px] mx-auto px-5 py-10 relative" style={{ zIndex: 1 }}>
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
            <header className="text-center mb-10">
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
          <article
            style={{
              opacity: transitioning ? 0 : 1,
              transition: 'opacity 0.55s ease',
            }}
          >
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
              <div className="pulse-grid">
                {dimensions.map(([label, value]) => (
                  <div key={label} className="pulse-item">
                    <span>{label}</span><strong>{value}</strong>
                    <i><b style={{ width: `${value}%` }} /></i>
                  </div>
                ))}
              </div>
              {pulse.fragments.length > 0 && (
                <p className="fragment-line">已拾取 {pulse.fragments.length}/6 枚时间碎片 · {pulse.fragments.at(-1)}</p>
              )}
            </header>

            {mapOpen && (
              <section className="timeline-map mb-8" aria-label="世界线星图">
                <div className="timeline-heading">
                  <div><strong>你的世界线</strong><span>点击已走过的节点，改选一次</span></div>
                  <span>{Math.max(1, 2 ** Math.min(branch.path.length, 17)).toLocaleString()} 种可能</span>
                </div>
                <div className="timeline-nodes">
                  {branch.path.map((step) => {
                    const scene = branch.scenes.find((item) => item.scene === step.scene)
                    return (
                      <button key={step.scene} onClick={() => handleFork(step.scene, step.choice)} title="从这里进入另一条世界线">
                        <span>{step.scene}</span>
                        <small>{step.decision ?? scene?.choices?.[step.choice] ?? (step.choice === 0 ? '选择 A' : '选择 B')}</small>
                        <em>改选</em>
                      </button>
                    )
                  })}
                  {branch.path.length === 0 && <p>做出第一个选择后，世界线会从这里生长。</p>}
                </div>
              </section>
            )}

            {/* 走过的幕（紧凑回显） */}
            {doneScenes.map((s) => (
              <section key={s.scene} className="mb-6 done-scene">
                <p className="text-[11px] tracking-widest mb-1.5" style={{ color: 'var(--color-ink-secondary)', opacity: 0.6 }}>
                  第{s.scene}幕
                </p>
                {s.paragraphs.map((p, i) => (
                  <p key={i} className="para m-0 text-[14.5px] leading-[1.75]" style={{ color: 'var(--color-ink-secondary)' }}>
                    {p}
                  </p>
                ))}
              </section>
            ))}

            {/* 当前幕（走马灯逐字点亮） */}
            <section className="mb-8">
              <p className="text-[12px] tracking-widest mb-2" style={{ color: 'var(--color-primary-strong)' }}>
                {branch.scene === TOTAL_SCENES ? '结局' : `第 ${branch.scene} 幕`}
              </p>
              {branch.paragraphs.map((p, i) => (
                <p key={`${branch.scene}-${i}`} className="para m-0 text-[16px]" style={{ color: 'var(--color-ink)' }}>
                  <MarqueeText text={p} active={branch.phase === 'streaming'} />
                </p>
              ))}
              {branch.insight && (
                <section className={`insight-card mt-8 ${branch.phase === 'done' ? 'insight-glow' : 'insight-card-streaming'}`}>
                  <span className="insight-mark">✶</span>
                  <p className="insight-text">
                    <MarqueeText text={branch.insight} charInterval={60} active={branch.phase === 'streaming'} />
                  </p>
                </section>
              )}
            </section>

            {/* 幕尾交互区 */}
            {branch.phase === 'done' && branch.choices && !isFinalDone && (
              <div className="choice-zone">
                <p className="text-center text-[13px] mb-4" style={{ color: 'var(--color-ink-secondary)' }}>
                  {resumed ? '从这里继续，你的选择是——' : '岔路口到了，你的选择是——'}
                </p>
                <div className="flex flex-col gap-3 mb-10">
                  {branch.choices.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => handleChoose(i as 0 | 1)}
                      className="choice-btn"
                    >
                      <span className="choice-mark">{'①②'[i]}</span>
                      {c}
                    </button>
                  ))}
                  {!customDecisionOpen ? (
                    <button onClick={() => setCustomDecisionOpen(true)} className="custom-decision-trigger">
                      <span>＋</span>
                      这两个都不是，我自己决定
                    </button>
                  ) : (
                    <form
                      className="custom-decision-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        const decision = customDecision.trim()
                        if (decision.length >= 2) handleChoose(0, decision)
                      }}
                    >
                      <label htmlFor="custom-decision">此刻，你真正想怎么做？</label>
                      <textarea
                        id="custom-decision"
                        autoFocus
                        value={customDecision}
                        onChange={(event) => setCustomDecision(event.target.value.slice(0, 120))}
                        placeholder="例如：我不辞职，也不留下。我申请三个月假期，先去看看外面的世界。"
                        rows={3}
                        maxLength={120}
                      />
                      <div>
                        <span>{customDecision.length}/120</span>
                        <button type="button" onClick={() => setCustomDecisionOpen(false)}>取消</button>
                        <button type="submit" disabled={customDecision.trim().length < 2}>就这样决定</button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
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
                <span className="inline-flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="breathing inline-block w-1.5 h-1.5 rounded-full"
                      style={{ background: 'var(--color-primary-strong)', animationDelay: `${i * 0.25}s` }}
                    />
                  ))}
                </span>
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

            {/* 幕进度指示：18 幕改为当前幕为中心的局部窗口，避免整条塞满屏幕 */}
            <div className="flex justify-center items-center gap-1 mb-4 overflow-hidden" style={{ maxWidth: 180, margin: '0 auto 16px' }}>
              {Array.from({ length: TOTAL_SCENES }, (_, i) => {
                const n = i + 1
                const distance = Math.abs(n - branch.scene)
                if (distance > 4) return null // 窗口外的不渲染，只显示前后各 4 幕
                const isCurrent = n === branch.scene
                const isPast = n < branch.scene
                return (
                  <span
                    key={n}
                    className="inline-block rounded-full transition-all duration-500"
                    style={{
                      width: isCurrent ? 16 : distance <= 2 ? 5 : 3,
                      height: isCurrent ? 4 : 3,
                      background: isPast || isCurrent ? 'var(--color-primary-strong)' : 'var(--color-line)',
                      opacity: isCurrent ? 1 : distance <= 2 ? 0.85 : 0.4,
                    }}
                  />
                )
              })}
            </div>
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
                {caughtArchive.scenes.map((scene) => (
                  <section key={scene.scene}>
                    <small>第 {scene.scene} 幕</small>
                    {scene.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                  </section>
                ))}
                <blockquote>{caughtArchive.insight}</blockquote>
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

      {toast && (
        <div
          className="fixed left-1/2 bottom-16 -translate-x-1/2 px-4 py-2 rounded-full text-[14px]"
          style={{ background: 'var(--color-card)', color: 'var(--color-ink)', border: '0.5px solid var(--color-line)', zIndex: 20 }}
        >
          {toast}
        </div>
      )}

      <AmbientMusicButton enabled={music.enabled} onToggle={music.toggle} />

      {archiveChoiceOpen && (
        <div className="destination-backdrop" role="presentation" onMouseDown={() => setArchiveChoiceOpen(false)}>
          <section className="destination-dialog" role="dialog" aria-modal="true" aria-labelledby="destination-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="destination-close" onClick={() => setArchiveChoiceOpen(false)} aria-label="关闭">×</button>
            <p>旅程结束了</p>
            <h2 id="destination-title">这份人生，要去哪里？</h2>
            <div className="destination-options">
              <button onClick={handleThrowToSea} disabled={archiveBusy}>
                <span>≈</span><strong>丢入大海</strong><small>匿名公开保存，可能被陌生人打捞阅读</small>
              </button>
              <button onClick={handleLaunchToGalaxy} disabled={archiveBusy}>
                <span>✦</span><strong>发射到银河</strong><small>不上传、不保存，离开后无法找回</small>
              </button>
            </div>
            {oceanMessage && <p className="destination-message" aria-live="polite">{oceanMessage}</p>}
          </section>
        </div>
      )}
    </div>
  )
}
