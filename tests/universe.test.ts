import { describe, expect, it } from 'vitest'
import { getLifeStage, getUniversePulse, pathDistance } from '../src/lib/universe'

describe('parallel universe state', () => {
  it('turns choices into a persistent, bounded life profile', () => {
    const path = Array.from({ length: 17 }, (_, index) => ({ scene: index + 1, choice: (index % 2) as 0 | 1 }))
    const pulse = getUniversePulse(path)
    expect(Object.values(pulse.values).every((value) => value >= 36 && value <= 100)).toBe(true)
    expect(pulse.fragments).toHaveLength(6)
    expect(pulse.title).toContain('宇宙')
  })

  it('reveals life stages instead of presenting eighteen identical chapters', () => {
    expect(getLifeStage(1)).toBe('初入世界')
    expect(getLifeStage(10)).toBe('穿过风浪')
    expect(getLifeStage(18)).toBe('回望与抵达')
  })

  it('counts decisions changed between two universes', () => {
    expect(pathDistance(
      [{ scene: 1, choice: 0 }, { scene: 2, choice: 1 }],
      [{ scene: 1, choice: 1 }, { scene: 2, choice: 1 }],
    )).toBe(1)
  })
})
