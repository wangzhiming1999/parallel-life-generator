import type { BranchRunState } from '../shared/protocol'

export type LifeDimension = '勇气' | '自由' | '联结' | '安稳'

export interface UniversePulse {
  values: Record<LifeDimension, number>
  dominant: LifeDimension
  title: string
  fragments: string[]
}

const dimensions: LifeDimension[] = ['勇气', '自由', '联结', '安稳']
const fragmentScenes: Record<number, string> = {
  3: '未寄出的信',
  6: '雨夜车票',
  9: '旧钥匙',
  12: '凌晨的语音',
  15: '褪色合照',
  17: '写给自己的明信片',
}

export function getUniversePulse(path: BranchRunState['path']): UniversePulse {
  const values: Record<LifeDimension, number> = { 勇气: 36, 自由: 36, 联结: 36, 安稳: 36 }

  path.forEach(({ scene, choice }) => {
    const primary = dimensions[(scene + choice * 2) % dimensions.length]
    const secondary = dimensions[(scene + choice * 2 + 1) % dimensions.length]
    values[primary] = Math.min(100, values[primary] + 8)
    values[secondary] = Math.min(100, values[secondary] + 3)
  })

  const dominant = dimensions.reduce((best, item) => values[item] > values[best] ? item : best)
  const titles: Record<LifeDimension, string> = {
    勇气: '破浪者宇宙',
    自由: '旷野宇宙',
    联结: '群星宇宙',
    安稳: '长灯宇宙',
  }

  return {
    values,
    dominant,
    title: titles[dominant],
    fragments: Object.entries(fragmentScenes)
      .filter(([scene]) => path.some((step) => step.scene >= Number(scene)))
      .map(([, fragment]) => fragment),
  }
}

export function getLifeStage(scene: number): string {
  if (scene <= 3) return '初入世界'
  if (scene <= 6) return '选择方向'
  if (scene <= 9) return '建立生活'
  if (scene <= 12) return '穿过风浪'
  if (scene <= 15) return '重新理解自己'
  return '回望与抵达'
}

export function pathDistance(a: BranchRunState['path'], b: BranchRunState['path']): number {
  const length = Math.max(a.length, b.length)
  let different = 0
  for (let index = 0; index < length; index += 1) {
    if (a[index]?.choice !== b[index]?.choice) different += 1
  }
  return different
}
