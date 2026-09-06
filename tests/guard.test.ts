import { describe, it, expect } from 'vitest'
import { containsSensitiveWord, validateGenerateBody } from '../api/_guard'

describe('敏感词过滤', () => {
  it('命中政治类敏感词', () => {
    expect(containsSensitiveWord('如果我对法轮功感兴趣')).toBe(true)
  })
  it('命中自伤类敏感词', () => {
    expect(containsSensitiveWord('如果我决定自杀')).toBe(true)
  })
  it('归一化后仍命中（插入空格和符号绕过）', () => {
    expect(containsSensitiveWord('如 果 我 想 自*残')).toBe(true)
  })
  it('普通假设不误伤', () => {
    expect(containsSensitiveWord('如果当年毕业留在了北京')).toBe(false)
    expect(containsSensitiveWord('如果当初辞职开了咖啡店')).toBe(false)
  })
})

describe('服务端字段二次校验', () => {
  it('合法请求通过', () => {
    const r = validateGenerateBody({ assumption: '如果毕业我没回老家', age: '28', occupation: '运营', personality: '' })
    expect(r.ok).toBe(true)
  })
  it('空/过短假设拒绝', () => {
    expect(validateGenerateBody({ assumption: '' }).ok).toBe(false)
    expect(validateGenerateBody({ assumption: '如' }).ok).toBe(false)
  })
  it('超长假设拒绝', () => {
    expect(validateGenerateBody({ assumption: '如'.repeat(51) }).ok).toBe(false)
  })
  it('非字符串注入字段被安全转为空串', () => {
    const r = validateGenerateBody({ assumption: '如果早点睡', age: { evil: 1 } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.age).toBe('')
  })
  it('年龄非数字拒绝', () => {
    expect(validateGenerateBody({ assumption: '如果早点睡', age: 'abc' }).ok).toBe(false)
  })
})
