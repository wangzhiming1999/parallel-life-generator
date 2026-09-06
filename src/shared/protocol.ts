// 硅基流动 API 中转的共享类型与常量（前端/函数两侧复用）
export interface GenerateRequest {
  assumption: string
  age?: string
  occupation?: string
  personality?: string
}

export interface StoryResult {
  title: string
  story: string
  insight: string
  createdAt: number
  version: 1
}

// 分段标签协议（实测 Qwen3-8B 关思考后遵从率 100%，远高于 === 分隔符的 ~50%）
export const SECTION_TAGS = {
  title: '【标题】',
  story: '【正文】',
  insight: '【感悟】',
} as const

/**
 * 解析标签协议的流式/完整文本。
 * 返回 { title, paragraphs, insight }，未出现的字段为空。
 */
export function parseTaggedText(text: string): {
  title: string
  paragraphs: string[]
  insight: string
} {
  const titleIdx = text.indexOf(SECTION_TAGS.title)
  const storyIdx = text.indexOf(SECTION_TAGS.story)
  const insightIdx = text.indexOf(SECTION_TAGS.insight)

  const title =
    titleIdx >= 0
      ? text.slice(titleIdx + SECTION_TAGS.title.length, storyIdx > 0 ? storyIdx : undefined)
      : ''
  const story =
    storyIdx >= 0
      ? text.slice(storyIdx + SECTION_TAGS.story.length, insightIdx > 0 ? insightIdx : undefined)
      : ''
  const insight = insightIdx >= 0 ? text.slice(insightIdx + SECTION_TAGS.insight.length) : ''

  return {
    title: title.trim().slice(0, 20),
    paragraphs: story
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    insight: insight.trim().split('\n')[0] ?? '',
  }
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
export const STORAGE_KEY = 'parallel_life_last_result'
export const STORAGE_VERSION = 1
