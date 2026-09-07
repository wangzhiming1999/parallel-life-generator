// 硅基流动 API 中转的共享类型与常量（前端/函数两侧复用）
// v3：18 幕完整人生——17 幕分支 + 结局，走马灯逐字点亮

export interface GenerateRequest {
  assumption: string
  age?: string
  occupation?: string
  personality?: string
}

export interface DecisionStep {
  scene: number
  choice: 0 | 1
  /** 用户实际做出的决定；既可以来自预设选项，也可以由用户自由输入。 */
  decision?: string
}

export interface StoryMemoryScene {
  scene: number
  text: string
  decision?: string
}

/** 模型每幕更新的长期事实账本；只用于续写，不展示给读者。 */
export interface LifeLedger {
  currentAge: string
  currentTime: string
  location: string
  occupation: string
  people: string[]
  irreversibleFacts: string[]
  objects: string[]
  openThreads: string[]
  recentConsequences: string[]
  usedMotifs: string[]
}

/** 幕间请求体：报告当前进度与已做选择，让后端续写下一幕 */
export interface SceneRequest extends GenerateRequest {
  /** 当前请求的幕序号：1..TOTAL_SCENES（最后一幕为结局幕） */
  scene: number
  /** 已走过的路径：[{scene:1, choice:0}, ...]，供后端续写 */
  history: DecisionStep[]
  /** 最近几幕的真实正文，用来保持人物、地点和动作连续。 */
  context?: StoryMemoryScene[]
  /** 上一幕确认过的长期事实，避免职业、关系和物件状态在长篇中漂移。 */
  ledger?: LifeLedger
}

export type Phase = 'idle' | 'loading' | 'streaming' | 'done'

/** 单幕完整数据（客户端组装用于存档） */
export interface SceneData {
  scene: number
  paragraphs: string[]
  /** 非结局幕的选项；结局幕为 null */
  choices: [string, string] | null
  /** 结局幕的感悟；非结局幕为 null */
  insight: string | null
  /** 隐藏的长期事实账本。旧存档没有该字段时仍可正常读取。 */
  ledger?: LifeLedger | null
}

/** 一局完整存档 */
export interface BranchRunState {
  assumption: string
  age: string
  occupation: string
  personality: string
  /** 已完成的幕 */
  scenes: SceneData[]
  /** 已做的选择（与 scenes 对齐，最后一幕若已有 choices 则无对应项） */
  path: DecisionStep[]
  createdAt: number
  version: 3
}

// 标签协议（Qwen3-8B 关思考后遵从率 100%）
export const SECTION_TAGS = {
  story: '【正文】',
  optionA: '【选项A】',
  optionB: '【选项B】',
  insight: '【感悟】',
  ledger: '【人生档案】',
} as const

export const TOTAL_SCENES = 18 // 前 17 幕分支 + 第 18 幕结局（完整人生）

/** 解析一幕的标签流式/完整文本 */
export function parseSceneText(text: string): {
  paragraphs: string[]
  choices: [string, string] | null
  insight: string | null
  ledger: LifeLedger | null
} {
  const storyIdx = text.indexOf(SECTION_TAGS.story)
  const aIdx = text.indexOf(SECTION_TAGS.optionA)
  const bIdx = text.indexOf(SECTION_TAGS.optionB)
  const insIdx = text.indexOf(SECTION_TAGS.insight)
  const ledgerIdx = text.indexOf(SECTION_TAGS.ledger)
  const nextSection = (...indexes: number[]) => indexes.filter((index) => index >= 0).sort((a, b) => a - b)[0]

  const story =
    storyIdx >= 0
      ? text.slice(storyIdx + SECTION_TAGS.story.length, nextSection(aIdx, insIdx, ledgerIdx))
      : ''
  const choiceA =
    aIdx >= 0
      ? text.slice(aIdx + SECTION_TAGS.optionA.length, bIdx >= 0 ? bIdx : undefined).trim().split('\n')[0]
      : ''
  const choiceB = bIdx >= 0 ? text.slice(bIdx + SECTION_TAGS.optionB.length, nextSection(insIdx, ledgerIdx)).trim().split('\n')[0] : ''
  const insight = insIdx >= 0 ? text.slice(insIdx + SECTION_TAGS.insight.length, ledgerIdx >= 0 ? ledgerIdx : undefined).trim().split('\n')[0] : ''
  const ledgerText = ledgerIdx >= 0 ? text.slice(ledgerIdx + SECTION_TAGS.ledger.length).trim().split('\n')[0] : ''

  return {
    paragraphs: story
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    choices: choiceA && choiceB ? [choiceA, choiceB] : null,
    insight: insight || null,
    ledger: parseLifeLedger(ledgerText),
  }
}

const LEDGER_ARRAY_KEYS = ['people', 'irreversibleFacts', 'objects', 'openThreads', 'recentConsequences', 'usedMotifs'] as const

/** 把模型或请求中的未知数据收窄为可安全回传的事实账本。 */
export function parseLifeLedger(value: unknown): LifeLedger | null {
  let raw: unknown = value
  if (typeof value === 'string') {
    if (!value) return null
    try {
      raw = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const text = (key: string) => typeof record[key] === 'string' ? record[key].trim().slice(0, 80) : ''
  const list = (key: typeof LEDGER_ARRAY_KEYS[number]) => Array.isArray(record[key])
    ? record[key].filter((item): item is string => typeof item === 'string').map((item) => item.trim().slice(0, 120)).filter(Boolean).slice(0, 12)
    : []
  const ledger: LifeLedger = {
    currentAge: text('currentAge'),
    currentTime: text('currentTime'),
    location: text('location'),
    occupation: text('occupation'),
    people: list('people'),
    irreversibleFacts: list('irreversibleFacts'),
    objects: list('objects'),
    openThreads: list('openThreads'),
    recentConsequences: list('recentConsequences'),
    usedMotifs: list('usedMotifs'),
  }
  return ledger.currentTime && ledger.location && ledger.occupation ? ledger : null
}

export const QUICK_TAGS = [
  '如果当初和初恋没分手',
  '如果毕业我没回老家',
  '如果当初辞职开了咖啡店',
  '如果当年选了另一个专业',
  '如果当年没放弃某个爱好',
  '如果去了另一座城市',
] as const

export const ASSUMPTION_MAX_LEN = 50
export const STORAGE_KEY = 'parallel_life_branch_run'
export const STORAGE_VERSION = 3 // v3：18 幕人生（v2 为 4 幕，不兼容直接弃档）

export function decisionText(step: DecisionStep, choices?: [string, string] | null): string {
  const custom = step.decision?.trim()
  if (custom) return custom
  return choices?.[step.choice] ?? (step.choice === 0 ? '选择 A 的方向' : '选择 B 的方向')
}

export function formatStoryMemory(context: StoryMemoryScene[]): string {
  return context
    .map((item) => `第${item.scene}幕：${item.text}${item.decision ? `\n你的决定：${item.decision}` : ''}`)
    .join('\n\n')
}

const VAGUE_INSIGHT_PHRASES = [
  '不是什么了不起', '没什么了不起', '也没关系', '都没关系', '就够了', '也挺好', '这就很好', '慢一点',
  '你终于明白', '人生就是', '原来我们都',
]

export function isVagueInsight(insight: string | null): boolean {
  if (!insight || insight.replace(/[，。！？、\s]/g, '').length < 18) return true
  return VAGUE_INSIGHT_PHRASES.some((phrase) => insight.includes(phrase))
}

/** 拦截模型把上一幕整句搬进新一幕；短对话和必要名词不视为重复。 */
export function hasRepeatedNarrative(previous: string[], current: string): boolean {
  const normalize = (text: string) => text.replace(/[“”‘’「」『』\s]/g, '')
  const prior = normalize(previous.join(''))
  return current
    .split(/[。！？!?]/)
    .map(normalize)
    .some((sentence) => sentence.length >= 16 && prior.includes(sentence))
}
