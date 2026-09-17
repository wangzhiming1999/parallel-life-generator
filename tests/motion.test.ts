import { describe, expect, it } from 'vitest'
import { charStagger, withAlpha } from '../src/lib/motion'

describe('charStagger', () => {
  it('keeps the fine-grained interval while a batch stays small', () => {
    expect(charStagger(1, 28)).toBe(28)
    expect(charStagger(10, 28)).toBe(28)
  })

  it('compresses the step once a batch would blow the time budget', () => {
    // 64 字一批：900ms 预算分给 63 个间隔 → 14ms，比默认 28ms 更紧
    expect(charStagger(64, 28)).toBe(14)
    // 一次性涌入整段：步长收到下限，尾字也不会等上几秒
    expect(charStagger(400, 28)).toBe(4)
    expect(charStagger(400, 28) * 399).toBeLessThanOrEqual(2000)
  })

  it('never exceeds the requested interval', () => {
    for (const count of [2, 5, 33, 130]) {
      expect(charStagger(count, 60)).toBeLessThanOrEqual(60)
    }
  })
})

describe('withAlpha', () => {
  it('parses hex colors', () => {
    expect(withAlpha('#C77B4A', 0.85)).toBe('rgba(199, 123, 74, 0.85)')
    expect(withAlpha('#000000', 0)).toBe('rgba(0, 0, 0, 0)')
    expect(withAlpha('  #e8a87c  ', 1)).toBe('rgba(232, 168, 124, 1)')
  })

  it('accepts rgb()/rgba() so theme values in any notation work', () => {
    expect(withAlpha('rgb(134, 76, 59)', 0.2)).toBe('rgba(134, 76, 59, 0.2)')
    expect(withAlpha('rgba(134, 76, 59, 0.5)', 1)).toBe('rgba(134, 76, 59, 1)')
  })

  it('returns null for values anime.js could not interpolate anyway', () => {
    expect(withAlpha('', 1)).toBeNull()
    expect(withAlpha('var(--color-primary-strong)', 1)).toBeNull()
    expect(withAlpha('#fff', 1)).toBeNull()
  })
})
