import { useCallback, useEffect, useRef, useState } from 'react'
import { useGenerate } from './hooks/useGenerate'
import { useAmbientMusic, AmbientMusicButton, type AmbientScene } from './hooks/useAmbientMusic'
import ParticleBackground from './components/ParticleBackground'
import { ASSUMPTION_MAX_LEN, QUICK_TAGS, type StoryResult } from './shared/protocol'
import { copyText, loadLastResult, saveLastResult } from './lib/storage'

type View = 'input' | 'loading' | 'result'

export default function App() {
  const [view, setView] = useState<View>('input')
  const [assumption, setAssumption] = useState('')
  const [age, setAge] = useState('')
  const [occupation, setOccupation] = useState('')
  const [personality, setPersonality] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [cached, setCached] = useState<StoryResult | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const music = useAmbientMusic()

  const handleDone = useCallback((result: StoryResult) => {
    saveLastResult(result)
    setView('result')
  }, [])

  const { phase, error, title, paragraphs, insight, streamingIndex, generate, cancel, reset, showResult } = useGenerate({
    onDone: handleDone,
  })

  // 刷新后恢复最近一条结果
  useEffect(() => {
    const last = loadLastResult()
    if (last) setCached(last)
  }, [])

  const canSubmit = assumption.trim().length >= 2 && phase !== 'loading' && phase !== 'streaming'

  const handleSubmit = () => {
    if (!canSubmit) return
    setCached(null)
    generate({ assumption: assumption.trim(), age, occupation, personality })
  }

  // phase 变化驱动视图（streaming 时留在结果页布局）
  useEffect(() => {
    if (phase === 'loading') setView('loading')
    if (phase === 'streaming' || phase === 'done') setView('result')
    if (phase === 'idle' && error) setView('input')
  }, [phase, error])

  // 背景音乐跟随场景切换
  useEffect(() => {
    const scene: AmbientScene =
      view === 'input' ? 'input' : view === 'loading' ? 'generating' : phase === 'done' ? 'result' : 'generating'
    music.setScene(scene)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, phase])

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(''), 2000)
  }

  const handleCopy = async () => {
    const full = `${title}\n\n${paragraphs.join('\n\n')}\n\n「${insight}」\n\n—— 平行人生生成器 · 内容由AI生成，仅供娱乐`
    const ok = await copyText(full)
    showToast(ok ? '已复制到剪贴板' : '复制失败，请长按屏幕手动复制')
  }

  const handleAnother = () => {
    reset()
    setView('input')
  }

  const handleReviewCached = (result: StoryResult) => {
    showResult(result)
    setView('result')
  }

  return (
    <div className="min-h-dvh flex flex-col relative" style={{ background: 'var(--color-page)' }}>
      <ParticleBackground />
      <main className="flex-1 w-full max-w-[640px] mx-auto px-5 py-10 relative" style={{ zIndex: 1 }}>
        {view === 'input' && (
          <>
            {cached && (
              <section className="mb-8">
                <p className="text-[13px] mb-3" style={{ color: 'var(--color-ink-secondary)' }}>
                  你上次推开了一扇门：
                </p>
                <button
                  onClick={() => handleReviewCached(cached)}
                  className="insight-card w-full text-left cursor-pointer"
                >
                  <span className="insight-mark">✶</span>
                  <p className="font-medium text-[18px] m-0" style={{ color: 'var(--color-ink)' }}>{cached.title}</p>
                  <p className="text-[13px] mt-2 mb-0" style={{ color: 'var(--color-ink-secondary)' }}>
                    点击回看 · 再写一个新的也可以
                  </p>
                </button>
              </section>
            )}
            <header className="text-center mb-10">
              <h1 className="text-[26px] font-medium m-0" style={{ color: 'var(--color-ink)', lineHeight: 1.4 }}>
                平行人生档案馆
              </h1>
              <p className="text-[14px] mt-2 mb-0" style={{ color: 'var(--color-ink-secondary)' }}>
                写下你的「如果」，解锁另一种人生
              </p>
            </header>

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

            {error && (
              <p className="text-[14px] text-center mb-4" style={{ color: 'var(--color-primary-strong)' }}>
                {error}
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

        {view === 'loading' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="flex gap-2 mb-6">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="breathing inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: 'var(--color-primary)', animationDelay: `${i * 0.25}s` }}
                />
              ))}
            </div>
            <p className="text-[15px] m-0" style={{ color: 'var(--color-ink-secondary)' }}>
              正在穿越平行时空…
            </p>
            <button
              onClick={() => {
                cancel()
                setView('input')
              }}
              className="mt-8 text-[14px] bg-transparent cursor-pointer"
              style={{ color: 'var(--color-ink-secondary)', border: 'none' }}
            >
              取消
            </button>
          </div>
        )}

        {view === 'result' && (
          <article>
            <h1 className="text-center text-[24px] font-medium mt-2 mb-8" style={{ color: 'var(--color-ink)', lineHeight: 1.4 }}>
              {title || '…'}
              {phase === 'streaming' && streamingIndex === -1 && <span className="type-cursor" />}
            </h1>
            <div className="space-y-5 mb-8">
              {paragraphs.map((p, i) => (
                <p key={`${i}-${p.slice(0, 8)}`} className="para m-0" style={{ color: 'var(--color-ink)' }}>
                  {p}
                  {phase === 'streaming' && streamingIndex === i && <span className="type-cursor" />}
                </p>
              ))}
            </div>
            {insight && (
              <section className={`insight-card mb-10 ${phase === 'streaming' ? 'insight-card-streaming' : ''}`}>
                <span className="insight-mark">✶</span>
                <p className="insight-text">
                  {insight}
                  {phase === 'streaming' && streamingIndex === -2 && <span className="type-cursor" />}
                </p>
              </section>
            )}
            {phase !== 'done' ? (
              // 流式进行中：柔和的书写状态指示，替代生硬的置灰按钮
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
                  {phase === 'loading' ? '正在穿越平行时空…' : '正在书写这段人生…'}
                </span>
              </div>
            ) : (
              <div className="flex gap-3 mb-12">
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
                  复制全文
                </button>
                <button
                  onClick={handleAnother}
                  className="flex-1 h-[48px] rounded-full text-[16px]"
                  style={{
                    background: 'transparent',
                    color: 'var(--color-ink)',
                    border: '0.5px solid var(--color-line)',
                    cursor: 'pointer',
                  }}
                >
                  再写一个
                </button>
              </div>
            )}
          </article>
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
    </div>
  )
}
