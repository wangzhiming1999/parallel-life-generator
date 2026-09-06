import { describe, expect, it } from 'vitest'
import { validateArchive } from '../api/archives'

const completeArchive = {
  assumption: '如果当年去了另一座城市',
  universeTitle: '旷野宇宙',
  insight: '有些路不是为了抵达，而是为了让你认出自己。',
  scenes: Array.from({ length: 18 }, (_, index) => ({
    scene: index + 1,
    paragraphs: [`这是第 ${index + 1} 幕。`],
    choices: index < 17 ? ['留下', '出发'] : null,
    insight: index === 17 ? '有些路不是为了抵达。' : null,
  })),
  path: Array.from({ length: 17 }, (_, index) => ({ scene: index + 1, choice: index % 2, decision: '继续向前' })),
}

describe('archive boundary validation', () => {
  it('accepts a complete anonymous life archive', () => {
    const result = validateArchive(completeArchive)
    expect(result?.scenes).toHaveLength(18)
    expect(result?.path).toHaveLength(17)
    expect(result).not.toHaveProperty('age')
    expect(result).not.toHaveProperty('occupation')
  })

  it('rejects incomplete runs so unfinished stories cannot enter the sea', () => {
    expect(validateArchive({ ...completeArchive, scenes: completeArchive.scenes.slice(0, 3) })).toBeNull()
  })

  it('trims oversized custom decisions at the API boundary', () => {
    const result = validateArchive({
      ...completeArchive,
      path: completeArchive.path.map((step, index) => index === 0 ? { ...step, decision: '向前'.repeat(100) } : step),
    })
    expect(result?.path[0].decision).toHaveLength(120)
  })
})
