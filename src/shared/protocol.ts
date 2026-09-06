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

// 分隔符分段流式输出协议：标题 === 正文 === 感悟
export const SECTION_SEPARATOR = '==='

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
