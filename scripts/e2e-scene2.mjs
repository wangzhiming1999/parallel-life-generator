// 端到端模拟真实用户玩到第二幕：scene1 -> 选择 -> scene2
const URL = 'https://parallel-life-generator.vercel.app/api/generate'
const H = { 'Content-Type': 'application/json', Origin: 'https://parallel-life-generator.vercel.app' }
const BASE = { assumption: '如果当年辞职开了咖啡店', age: '28', occupation: '程序员', personality: '内敛' }

function parse(text) {
  const aIdx = text.indexOf('【选项A】'); const bIdx = text.indexOf('【选项B】'); const insIdx = text.indexOf('【感悟】')
  const story = text.slice(text.indexOf('【正文】') + 4, aIdx >= 0 ? aIdx : insIdx >= 0 ? insIdx : undefined)
  const A = aIdx >= 0 ? text.slice(aIdx + 4, bIdx >= 0 ? bIdx : undefined).trim().split('\n')[0] : ''
  const B = bIdx >= 0 ? text.slice(bIdx + 4, insIdx >= 0 ? insIdx : undefined).trim().split('\n')[0] : ''
  return { paragraphs: story.split('\n').map(s => s.trim()).filter(Boolean), choices: A && B ? [A, B] : null, insight: insIdx >= 0 ? 1 : null }
}

const t0 = Date.now()
const r1 = await fetch(URL, { method: 'POST', headers: H, body: JSON.stringify({ ...BASE, scene: 1, history: [] }) })
const t1 = await r1.text()
const p1 = parse(t1)
console.log('第1幕:', r1.status, '选项=' + JSON.stringify(p1.choices), (Date.now() - t0) / 1000 + 's')
if (!p1.choices) { console.log('FAIL: 第一幕无选项'); process.exit(1) }

const t2 = Date.now()
const r2 = await fetch(URL, { method: 'POST', headers: H, body: JSON.stringify({ ...BASE, scene: 2, history: [{ scene: 1, choice: 0 }] }) })
const t2t = await r2.text()
const p2 = parse(t2t)
console.log('第2幕:', r2.status, '选项=' + JSON.stringify(p2.choices), (Date.now() - t2) / 1000 + 's')
if (!p2.choices) { console.log('FAIL: 第二幕无选项'); process.exit(1) }
console.log('全链路 OK：岔路口可继续选路')
