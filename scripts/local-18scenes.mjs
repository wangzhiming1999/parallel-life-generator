// 本地验证 18 幕：测第 1 幕、第 9 幕（中年）、第 18 幕（结局）三档 prompt
const URL = 'http://localhost:3000/api/generate'
const H = { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }
const BASE = { assumption: '如果当年辞职开了咖啡店', age: '28', occupation: '程序员', personality: '内敛' }

function parse(text) {
  const T = { story: '【正文】', a: '【选项A】', b: '【选项B】', ins: '【感悟】' }
  const sI = text.indexOf(T.story), aI = text.indexOf(T.a), bI = text.indexOf(T.b), iI = text.indexOf(T.ins)
  const A = aI >= 0 ? text.slice(aI + T.a.length, bI >= 0 ? bI : undefined).trim().split('\n')[0] : ''
  const B = bI >= 0 ? text.slice(bI + T.b.length, iI >= 0 ? iI : undefined).trim().split('\n')[0] : ''
  const ins = iI >= 0 ? text.slice(iI + T.ins.length).trim().split('\n')[0] : ''
  return { choices: A && B ? [A, B] : null, insight: ins || null }
}

// scene 1: 第一幕
let r = await fetch(URL, { method: 'POST', headers: H, body: JSON.stringify({ ...BASE, scene: 1, history: [] }) })
let t = await r.text()
console.log('第1幕:', r.status, JSON.stringify(parse(t).choices))

// scene 9: 中年段（验证 lifeStageOf 注入后仍完整协议）
r = await fetch(URL, { method: 'POST', headers: H, body: JSON.stringify({ ...BASE, scene: 9, history: Array.from({length: 8}, (_, i) => ({ scene: i + 1, choice: i % 2 })) }) })
t = await r.text()
console.log('第9幕:', r.status, JSON.stringify(parse(t).choices))

// scene 18: 结局幕（验证感悟 + 17 项 history 通过校验）
r = await fetch(URL, { method: 'POST', headers: H, body: JSON.stringify({ ...BASE, scene: 18, history: Array.from({length: 17}, (_, i) => ({ scene: i + 1, choice: i % 2 })) }) })
t = await r.text()
const f = parse(t)
console.log('第18幕(结局):', r.status, '感悟:', JSON.stringify(f.insight?.slice(0, 30)))

// scene 19 应被拒（越界校验）
r = await fetch(URL, { method: 'POST', headers: H, body: JSON.stringify({ ...BASE, scene: 19, history: [] }) })
console.log('第19幕越界:', r.status, r.status === 400 ? '正确拒绝' : 'FAIL')
