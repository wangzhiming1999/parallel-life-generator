import { STORAGE_KEY, STORAGE_VERSION, type StoryResult } from '../shared/protocol'

export function saveLastResult(result: StoryResult): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result))
  } catch {
    // 隐私模式/容量满时静默失败
  }
}

export function loadLastResult(): StoryResult | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoryResult>
    // 版本化校验：版本不匹配或结构缺失即丢弃
    if (parsed.version !== STORAGE_VERSION) return null
    if (typeof parsed.title !== 'string' || typeof parsed.story !== 'string' || typeof parsed.insight !== 'string') {
      return null
    }
    return parsed as StoryResult
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch { /* 忽略 */ }
    return null
  }
}

// 复制全文（Clipboard API + execCommand 降级，兼容微信内置浏览器/HTTP 非安全上下文）
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* 降级 */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
