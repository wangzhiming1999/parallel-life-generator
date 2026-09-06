// 模拟客户端流循环：验证「流提前 done / 空闲 abort」两类路径下的行为
const CASES = {
  A_完整流: '【正文】\n你站在租下的小店面里，手里还擦着咖啡豆样品。\n\n窗外的梧桐叶落了满地，你想起三年前写字楼里的空调。\n【选项A】留下来守着小店\n【选项B】关店回去上班',
  B_只有正文_流提前end: '【正文】\n你站在租下的小店面里，手里还擦着咖啡豆样品。\n\n窗外的梧桐叶落了满地。',
  C_选项A被截断: '【正文】\n你站在租下的小店面里。\n【选项A】留下来守着小店',
}

function parseSceneText(text) {
  const storyIdx = text.indexOf('【正文】')
  const aIdx = text.indexOf('【选项A】')
  const bIdx = text.indexOf('【选项B】')
  const insIdx = text.indexOf('【感悟】')
  const story = storyIdx >= 0 ? text.slice(storyIdx + 4, aIdx >= 0 ? aIdx : insIdx >= 0 ? insIdx : undefined) : ''
  const choiceA = aIdx >= 0 ? text.slice(aIdx + 4, bIdx >= 0 ? bIdx : undefined).trim().split('\n')[0] : ''
  const choiceB = bIdx >= 0 ? text.slice(bIdx + 4, insIdx >= 0 ? insIdx : undefined).trim().split('\n')[0] : ''
  return {
    paragraphs: story.split('\n').map((s) => s.trim()).filter(Boolean),
    choices: choiceA && choiceB ? [choiceA, choiceB] : null,
    insight: insIdx >= 0 ? text.slice(insIdx + 4).trim().split('\n')[0] : null,
  }
}

const TOTAL_SCENES = 4

for (const [name, text] of Object.entries(CASES)) {
  const acc = parseSceneText(text)
  // 模拟 useBranch 流结束后的归档逻辑（targetScene=1）
  const sceneData = { choices: 1 < TOTAL_SCENES ? acc.choices : null }
  const isDeadPage = !sceneData.choices
  const verdict = isDeadPage ? '死寂兜底页 [X]' : '岔路口正常 [OK]'
  console.log(name + ': choices=' + JSON.stringify(acc.choices) + ' -> ' + verdict)
}
