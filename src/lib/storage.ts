import { STORAGE_KEY, STORAGE_VERSION, type BranchRunState } from '../shared/protocol'

export function saveBranchRun(state: BranchRunState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 隐私模式/容量满时静默失败
  }
}

export function loadBranchRun(): BranchRunState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BranchRunState>
    if (parsed.version !== STORAGE_VERSION) return null
    if (typeof parsed.assumption !== 'string' || !Array.isArray(parsed.scenes) || !Array.isArray(parsed.path)) {
      return null
    }
    return parsed as BranchRunState
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch { /* 忽略 */ }
    return null
  }
}

export function clearBranchRun(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* 忽略 */ }
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
