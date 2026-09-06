import { describe, it, expect } from 'vitest'
import { decisionText, parseSceneText } from '../src/shared/protocol'

describe('parseSceneText 真实 Qwen 输出格式', () => {
  it('标签后带 trailing 空格和换行时能解析出选项', () => {
    // Qwen 实际输出格式：'【选项A】  \n继续弹，哪怕没人听  \n【选项B】  \n把琴卖掉'
    const real =
      '【正文】\n故事。\n\n【选项A】  \n继续弹，哪怕没人听  \n【选项B】  \n把琴卖掉，换一份稳定工作'
    const r = parseSceneText(real)
    expect(r.choices).not.toBeNull()
    expect(r.choices?.[0]).toContain('继续弹')
    expect(r.choices?.[1]).toContain('把琴卖掉')
  })

  it('流结束时 buffer 残留内容丢失（useBranch 切分 bug 复现）', () => {
    // useBranch 按 \n 切分，最后一段留在 buffer。若流结束前没 flush，
    // '把琴卖掉' 这段内容丢失 → choiceB 变成 '】' 或空
    const cut = '【正文】故事。【选项A】  继续弹，哪怕没人听  【选项B】  '
    const r = parseSceneText(cut)
    console.log('切分残留场景 choices:', JSON.stringify(r.choices))
    // 该场景下 choiceB 是 '】' → 不为空但内容错乱
  })

  it('选项内容以】开头的脏数据（trailing 空格场景）', () => {
    // 模拟切分后 choiceA/choiceB 以 】 开头
    const dirty = '【正文】故事。【选项A】】继续弹【选项B】】卖琴'
    const r = parseSceneText(dirty)
    console.log('脏数据 choices:', JSON.stringify(r.choices))
  })
})

describe('decisionText', () => {
  it('自定义决定优先于默认选项', () => {
    expect(decisionText({ scene: 1, choice: 0, decision: '我决定先休息半年，再重新出发' }, ['留下', '离开']))
      .toBe('我决定先休息半年，再重新出发')
  })

  it('没有自定义决定时使用默认选项', () => {
    expect(decisionText({ scene: 1, choice: 1 }, ['留下', '离开'])).toBe('离开')
  })
})
