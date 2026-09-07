import { describe, it, expect } from 'vitest'
import { decisionText, formatStoryMemory, hasRepeatedNarrative, isVagueInsight, parseSceneText } from '../src/shared/protocol'

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

  it('解析隐藏的人生档案，且不会把档案混进选项', () => {
    const output = [
      '【正文】',
      '你把记者证收进抽屉，决定去新城市继续调查。',
      '【选项A】',
      '接受报社驻外岗位',
      '【选项B】',
      '留在本地完成手上的报道',
      '【人生档案】',
      JSON.stringify({
        currentAge: '26岁',
        currentTime: '毕业后第四年',
        location: '北京',
        occupation: '记者',
        people: ['母亲：在老家，关系牵挂'],
        irreversibleFacts: ['大学毕业后没有回老家'],
        objects: ['记者证：收在书桌抽屉里'],
        openThreads: ['是否接受驻外岗位'],
        recentConsequences: ['错过了母亲的电话'],
        usedMotifs: ['未接来电'],
      }),
    ].join('\n')

    const parsed = parseSceneText(output)
    expect(parsed.choices?.[1]).toBe('留在本地完成手上的报道')
    expect(parsed.ledger?.occupation).toBe('记者')
    expect(parsed.ledger?.objects).toEqual(['记者证：收在书桌抽屉里'])
  })

  it('人生档案不是合法 JSON 时不接受', () => {
    const parsed = parseSceneText('【正文】故事。\n【人生档案】\n职业：记者')
    expect(parsed.ledger).toBeNull()
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

describe('formatStoryMemory', () => {
  it('keeps the actual previous scene and decision adjacent for narrative continuity', () => {
    expect(formatStoryMemory([
      { scene: 1, text: '你在宿舍收到家里的消息，盯着窗外没有说话。', decision: '买票回家看看' },
    ])).toContain('第1幕：你在宿舍收到家里的消息，盯着窗外没有说话。\n你的决定：买票回家看看')
  })
})

describe('isVagueInsight', () => {
  it('rejects generic comfort that does not explain the life just read', () => {
    expect(isVagueInsight('在茶馆里坐一坐，也不是什么了不起的事。')).toBe(true)
    expect(isVagueInsight('慢一点也没关系。')).toBe(true)
    expect(isVagueInsight('你终于明白，人生就是要学会珍惜。')).toBe(true)
    expect(isVagueInsight('原来我们都要学会与遗憾和解。')).toBe(true)
  })

  it('keeps a concrete conclusion tied to the story', () => {
    expect(isVagueInsight('那张回乡车票没有替你选对人生，却让你终于知道，牵挂和远方可以同时存在。')).toBe(false)
  })
})

describe('hasRepeatedNarrative', () => {
  it('detects a full sentence copied from a previous scene', () => {
    const previous = ['如今你学会了用“职业规划”代替“未来”，却始终没学会怎么把“我们”变成“我”。']
    expect(hasRepeatedNarrative(previous, '三个月后，你换了工位。如今你学会了用职业规划代替未来，却始终没学会怎么把我们变成我。')).toBe(true)
    expect(hasRepeatedNarrative(previous, '三个月后，你把入职通知书贴进采访本，第一次主动申请跑长期调查。')).toBe(false)
  })
})
