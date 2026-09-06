// 模拟浏览器端流解析：复现「正文出完就提前 done」的竞态
// 关键：服务端把 delta 直接 res.write(delta)，无换行分隔
// 客户端按 \n 切分后 chunk 若含 【选项A】 之前的部分文本，choices 不会置位
// 但如果上游 SSE 的 delta 恰好把「【正文】...全文...」一次性大块输出（Vercel 缓冲），
// parseSceneText 在只有正文时 choices=null，setPhase('done') 后 choices 仍为 null
// => 出现「岔路口没亮起来」死寂兜底页

// 复现：假设流只收到了正文（选项尚未生成时连接被中断/提前 end）
const text1 = '【正文】\n你站在租下的小店面里，手里还擦着咖啡豆样品。\n';
function parseSceneText(text) {
  const storyIdx = text.indexOf('【正文】');
  const aIdx = text.indexOf('【选项A】');
  const bIdx = text.indexOf('【选项B】');
  const insIdx = text.indexOf('【感悟】');
  const story = storyIdx >= 0 ? text.slice(storyIdx + 4, aIdx >= 0 ? aIdx : insIdx >= 0 ? insIdx : undefined) : '';
  const choiceA = aIdx >= 0 ? text.slice(aIdx + 4, bIdx >= 0 ? bIdx : undefined).trim().split('\n')[0] : '';
  const choiceB = bIdx >= 0 ? text.slice(bIdx + 4, insIdx >= 0 ? insIdx : undefined).trim().split('\n')[0] : '';
  return {
    paragraphs: story.split('\n').map(s => s.trim()).filter(Boolean),
    choices: choiceA && choiceB ? [choiceA, choiceB] : null,
  };
}
console.log('只有正文时:', JSON.stringify(parseSceneText(text1)));
// => paragraphs 有值，choices null → 若此时流 done → sceneData.choices=null → phase=done → 死寂兜底
