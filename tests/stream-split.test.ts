import { describe, it, expect } from 'vitest'
import { parseSceneText } from '../src/shared/protocol'

// 精确复刻修复后的 useBranch 流式切分逻辑（含流结束 flush）
function simulateStream(chunks: string[]) {
  let buffer = ''
  let finalText = ''
  for (const c of chunks) {
    buffer += c
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    finalText += lines.join('')
  }
  // 修复：流结束后 flush buffer 残留
  finalText += buffer
  buffer = ''
  return { finalText, bufferResidue: buffer }
}

describe('流式切分 + 解析（修复后）', () => {
  it('流末尾无换行 → flush 后 choiceB 完整', () => {
    const chunks = ['【正文】\n故事。\n\n【选项A】  \n', '继续弹，哪怕没人听  \n【选项B】  \n', '把琴卖掉，换一份稳定工作']
    const { finalText, bufferResidue } = simulateStream(chunks)
    expect(bufferResidue).toBe('')
    const r = parseSceneText(finalText)
    expect(r.choices).not.toBeNull()
    expect(r.choices?.[0]).toContain('继续弹')
    expect(r.choices?.[1]).toContain('把琴卖掉')
    console.log('修复后 choices:', JSON.stringify(r.choices))
  })

  it('流末尾有换行 → 正常', () => {
    const chunks = ['【正文】\n故事。\n\n【选项A】  \n继续弹  \n【选项B】  \n把琴卖掉  \n']
    const { finalText } = simulateStream(chunks)
    const r = parseSceneText(finalText)
    expect(r.choices).not.toBeNull()
  })

  it('单 chunk 全量（Vercel 缓冲场景）', () => {
    const chunks = ['【正文】\n故事。\n【选项A】留下来\n【选项B】去远方']
    const { finalText } = simulateStream(chunks)
    const r = parseSceneText(finalText)
    expect(r.choices).toEqual(['留下来', '去远方'])
  })

  it('结局幕感悟在末尾且无换行', () => {
    const chunks = ['【正文】\n结局。\n【感悟】', '允许自己慢下来']
    const { finalText } = simulateStream(chunks)
    const r = parseSceneText(finalText)
    expect(r.insight).toContain('允许自己慢下来')
  })
})
