import { describe, expect, it } from 'vitest'
import { ambientSceneForLife, journeyVolumeForScene, trackForAmbientScene } from '../src/hooks/useAmbientMusic'

describe('progressive ambient music (v2)', () => {
  it('keeps one journey track across all non-final scenes (no track switching)', () => {
    expect([1, 4, 8, 12, 16].map((scene) => ambientSceneForLife(scene))).toEqual([
      'journey', 'journey', 'journey', 'journey', 'journey',
    ])
  })

  it('marks the ending without replacing the playing audio source', () => {
    expect(ambientSceneForLife(18, true)).toBe('result')
    expect(trackForAmbientScene('result')).toBe(trackForAmbientScene('journey'))
  })

  it('keeps one stable journey volume instead of restarting fades every scene', () => {
    expect(journeyVolumeForScene(1)).toBeCloseTo(0.28)
    expect(journeyVolumeForScene(9)).toBe(journeyVolumeForScene(1))
    expect(journeyVolumeForScene(18)).toBe(journeyVolumeForScene(1))
  })
})
