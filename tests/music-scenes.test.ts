import { describe, expect, it } from 'vitest'
import { ambientSceneForLife } from '../src/hooks/useAmbientMusic'

describe('life-stage soundtrack', () => {
  it('changes atmosphere as the life moves through distinct stages', () => {
    expect([1, 4, 8, 12, 16].map((scene) => ambientSceneForLife(scene))).toEqual([
      'opening', 'departure', 'crossroads', 'settling', 'reflection',
    ])
  })

  it('always gives the ending its own closing score', () => {
    expect(ambientSceneForLife(18, true)).toBe('result')
  })
})
